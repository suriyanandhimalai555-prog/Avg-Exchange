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
    'SELECT id FROM users WHERE email = $1',
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

    // Broadcast recovered depth to any clients that connected during startup
    for (const pair of engine.getPairs()) {
      const depth = engine.getDepth(pair);
      io.emit('depth_update', { pair, asks: depth.asks, bids: depth.bids });
    }

    process.once('SIGINT',  () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  });
})();
