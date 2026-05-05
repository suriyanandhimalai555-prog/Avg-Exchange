require('dotenv').config();
const http   = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server: SocketServer } = require('socket.io');
const { errorHandler } = require('./middleware/errorMiddleware');
const engine        = require('./services/engineService');
const binanceStream = require('./services/binanceStreamService');
const db            = require('./db');
const userRoutes = require('./routes/user');
const cryptoRoutes = require('./routes/cryptoRoutes');
const oneInchRoutes = require('./routes/oneInchRoutes');
const marketRoutes = require('./routes/marketRoutes');
const tradeRoutes = require('./routes/tradeRoutes');
const kycRoutes   = require('./routes/kycRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// ── CORS ─────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173'];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Socket.io ─────────────────────────────────────────────────
const io = new SocketServer(server, {
  cors: { origin: allowedOrigins, credentials: true },
});

io.on('connection', (socket) => {
  // Client sends { userId } after authentication so we can target them
  socket.on('subscribe', ({ userId }) => {
    if (userId) socket.join(`user:${userId}`);
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
  for (const o of stale) {
    const [baseCurrency, quoteCurrency] = o.pair.split('/');
    const lockCurrency = o.side === 'buy' ? quoteCurrency : baseCurrency;
    const lockAmount   = o.side === 'buy'
      ? parseFloat(o.price) * parseFloat(o.remaining_quantity)
      : parseFloat(o.remaining_quantity);

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
const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`Server listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  }

  // Step 1: Cancel any stale bot orders BEFORE loading the book.
  // This prevents ghost fills when the bot is offline.
  try {
    await purgeStaleBotOrders();
  } catch (err) {
    console.error('[startup] Bot order purge failed:', err.message);
  }

  // Step 2: Reload legitimate open user orders into the engine.
  try {
    await engine.recoverFromDB();
    // Broadcast the recovered depth so any already-connected frontend sees it
    for (const pair of engine.getPairs()) {
      const depth = engine.getDepth(pair);
      io.emit('depth_update', { pair, asks: depth.asks, bids: depth.bids });
    }
  } catch (err) {
    console.error('[startup] Order recovery failed:', err.message);
  }

  // Graceful shutdown — drain connections, destroy streams, exit cleanly.
  //
  // We do NOT cancel open user orders here. User limit orders are durable:
  // they live in Postgres and are reloaded by recoverFromDB() on the next
  // boot. Cancelling them on every restart would be wrong (a user's resting
  // $65k BTC bid should not disappear just because we deployed a new build).
  //
  // Bot orders are handled separately: purgeStaleBotOrders() at startup
  // clears any stale bot liquidity before the book is reconstructed.
  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received — shutting down gracefully…`);
    binanceStream.destroy();
    server.close(() => {
      console.log('[server] HTTP server closed');
      process.exit(0);
    });
    // Force exit after 10 s if pending connections don't drain
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.once('SIGINT',  () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
});
