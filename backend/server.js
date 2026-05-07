require('dotenv').config();

// ── Startup guards ──────────────────────────────────────────────
if (!process.env.SECRET) {
  console.error('FATAL: process.env.SECRET is not set. Refusing to start.');
  process.exit(1);
}

const http   = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { Server: SocketServer } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { errorHandler } = require('./middleware/errorMiddleware');
const engine        = require('./services/engineService');
const binanceStream = require('./services/binanceStreamService');
const db            = require('./db');
const userRoutes = require('./routes/user');
const cryptoRoutes = require('./routes/cryptoRoutes');
const oneInchRoutes = require('./routes/oneInchRoutes');
const marketRoutes = require('./routes/marketRoutes');
const tradeRoutes   = require('./routes/tradeRoutes');
const kycRoutes     = require('./routes/kycRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(helmet({ contentSecurityPolicy: false })); // security headers
app.use(cors({ origin: allowedOrigins, credentials: true }));

// express.json() with a verify hook — the ONLY correct way to capture the raw
// body without consuming the stream before the parser sees it.
// req.rawBody is used by the OxaPay callback HMAC verifier.
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(cookieParser());

// ── Socket.io ─────────────────────────────────────────────────
const io = new SocketServer(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

// ── Socket.io authentication middleware ───────────────────────
io.use((socket, next) => {
  try {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const token = cookies.token;
    if (!token) return next(); // allow unauthenticated for public market data
    const payload = jwt.verify(token, process.env.SECRET);
    socket.userId = payload.id;
  } catch (_) {
    // Invalid token — allow connection for public data, just don't authenticate
  }
  next();
});

io.on('connection', (socket) => {
  // Auto-join user's private channel based on authenticated JWT
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }

  // Legacy subscribe — only allowed if userId matches the authenticated session
  socket.on('subscribe', ({ userId }) => {
    if (userId && socket.userId && socket.userId === userId) {
      socket.join(`user:${userId}`);
    }
  });

  socket.on('disconnect', () => {});
});

// ── Binance Live Streams ──────────────────────────────────────
// Starts ONE combined WebSocket to Binance carrying ticker, depth,
// trade, and kline streams for all supported pairs.
// Must be initialised after `io` is ready.
binanceStream.init(io);

// ── REST Routes ───────────────────────────────────────────────
app.use('/api/user',    userRoutes);
app.use('/api/crypto',  cryptoRoutes);
app.use('/api/1inch',   oneInchRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/trade',   tradeRoutes(io));
app.use('/api/kyc',     kycRoutes);
app.use('/api/admin',   adminRoutes);
app.use('/api/payment', paymentRoutes);

// Backwards-compatible alias
app.use('/api/trending', marketRoutes);

app.use(errorHandler);

// ── Static coin price oscillator ─────────────────────────
// Simulates realistic price movement within the admin-set range.
// Runs every 3 seconds — small random walk (±0.4% per tick), clamped to [min, max].
function startStaticCoinOscillator() {
  setInterval(async () => {
    try {
      const { rows } = await db.query(
        `SELECT symbol, min_price, max_price, current_price
           FROM static_coin_config WHERE enabled = TRUE LIMIT 1`
      );
      if (!rows[0]) return;

      const min     = parseFloat(rows[0].min_price);
      const max     = parseFloat(rows[0].max_price);
      const current = parseFloat(rows[0].current_price);

      // Random walk ±0.4%, biased slightly back toward centre to prevent drift
      const centre = (min + max) / 2;
      const bias   = (centre - current) / (max - min) * 0.002; // gentle pull
      const delta  = current * ((Math.random() * 0.008 - 0.004) + bias);
      const next   = Math.min(max, Math.max(min, current + delta));

      // Every 24 h, roll the 24h-ago snapshot forward
      const snapshot24hOld = rows[0].price_24h_updated_at
        ? Date.now() - new Date(rows[0].price_24h_updated_at).getTime() > 86_400_000
        : true;

      await db.query(
        `UPDATE static_coin_config
            SET current_price       = $1,
                price_24h_ago       = CASE WHEN $3 THEN current_price ELSE price_24h_ago END,
                price_24h_updated_at = CASE WHEN $3 THEN NOW() ELSE price_24h_updated_at END,
                updated_at          = NOW()
          WHERE symbol = $2`,
        [next.toFixed(10), rows[0].symbol, snapshot24hOld]
      );
    } catch (_) {}
  }, 20_000);
}

// ── Startup helpers ───────────────────────────────────────────
/**
 * Purge stale bot orders before the engine loads the book.
 *
 * Why this matters:
 *   recoverFromDB() reloads every 'open' order from Postgres into the
 *   in-memory engine. If the bot was killed (SIGKILL / crash / host reboot)
 *   its orders were never cancelled and remain 'open' in the DB. Without
 *   this cleanup they re-enter the live book and will match real user orders
 *   even though no bot is running — producing ghost fills.
 *
 * This function is idempotent and safe to run on every boot. If BOT_EMAIL
 * is not set it is a no-op.
 */
async function purgeStaleBotOrders() {
  const botEmail = process.env.BOT_EMAIL;
  if (!botEmail) return;

  const userRes = await db.query(
    'SELECT id FROM "User" WHERE email = $1',
    [botEmail]
  );
  if (userRes.rows.length === 0) return; // bot account not created yet

  const botId = userRes.rows[0].id;

  const { rows: stale } = await db.query(
    `SELECT id, side, pair, price, remaining_quantity
       FROM orders
      WHERE user_id = $1
        AND status IN ('open', 'partially_filled')`,
    [botId]
  );

  if (stale.length === 0) return;

  // Unlock reserved funds for every stale order before cancelling
  const Decimal = require('decimal.js');
  for (const o of stale) {
    const [baseCurrency, quoteCurrency] = o.pair.split('/');
    const lockCurrency = o.side === 'buy' ? quoteCurrency : baseCurrency;
    const lockAmount   = o.side === 'buy'
      ? new Decimal(o.price).mul(o.remaining_quantity).toFixed(10)
      : new Decimal(o.remaining_quantity).toFixed(10);

    await db.unlockFunds(botId, lockCurrency, lockAmount).catch((err) => {
      console.error(`[startup] Failed to unlock funds for stale bot order ${o.id}:`, err.message);
    });
  }

  await db.query(
    `UPDATE orders
        SET status     = 'cancelled',
            updated_at = NOW()
      WHERE user_id = $1
        AND status IN ('open', 'partially_filled')`,
    [botId]
  );

  console.log(`[startup] Purged ${stale.length} stale bot order(s) for ${botEmail} — book is clean`);
}

// ── Startup ───────────────────────────────────────────────────
// IMPORTANT: We run recovery BEFORE calling server.listen() so the engine
// is fully populated before the first HTTP request can arrive.
// Previously, listen() accepted connections while recoverFromDB() was still
// running — a race that could produce ghost fills against an empty book.

const PORT = process.env.PORT || 4000;

const shutdown = async (signal) => {
  console.log(`[server] ${signal} received — shutting down gracefully…`);
  binanceStream.destroy();
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
};

(async () => {
  // Step 1: Cancel stale bot orders BEFORE loading the book.
  try {
    await purgeStaleBotOrders();
  } catch (err) {
    console.error('[startup] Bot order purge failed:', err.message);
  }

  // Step 2: Reload open user orders into the engine.
  try {
    await engine.recoverFromDB();
  } catch (err) {
    console.error('[startup] Order recovery failed:', err.message);
  }

  // Step 3: NOW start accepting connections — book is ready.
  server.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Server listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    }

    // Start static coin price oscillator
    startStaticCoinOscillator();

    // ── Bot order cleanup — runs every 24 h ───────────────────────────────
    // The market-maker bot cancels and re-places ~160 orders every 15 s.
    // Without cleanup that's ~920k cancelled rows/day accumulating in the
    // orders table, slowing recoverFromDB() and every orders query.
    // This job deletes bot-owned cancelled/filled orders older than 24 h,
    // keeping only the last day of history. Real user orders are untouched.
    (async function scheduleBotOrderCleanup() {
      const runCleanup = async () => {
        const botEmail = process.env.BOT_EMAIL;
        if (!botEmail) return;
        try {
          const userRes = await db.query('SELECT id FROM "User" WHERE email = $1', [botEmail]);
          if (userRes.rows.length === 0) return;
          const botId = userRes.rows[0].id;
          const { rowCount } = await db.query(
            `DELETE FROM orders
              WHERE user_id  = $1
                AND status   IN ('cancelled', 'filled')
                AND updated_at < NOW() - INTERVAL '24 hours'`,
            [botId]
          );
          if (rowCount > 0) {
            console.log(`[cleanup] Deleted ${rowCount} old bot orders`);
          }
        } catch (err) {
          console.error('[cleanup] Bot order cleanup failed:', err.message);
        }
      };

      await runCleanup(); // run once immediately on startup
      setInterval(runCleanup, 24 * 60 * 60 * 1000); // then every 24 h
    })();

    // Broadcast recovered depth to any clients that connected during startup
    for (const pair of engine.getPairs()) {
      const depth = engine.getDepth(pair);
      io.emit('depth_update', { pair, asks: depth.asks, bids: depth.bids });
    }

    process.once('SIGINT',  () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  });
})();
