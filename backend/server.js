/**
 * server.js — Application entry point.
 *
 * Wires Express, Socket.io, routes, and background jobs.
 * All business logic lives in dedicated modules.
 */

'use strict';

const config = require('./config');

const http          = require('http');
const express       = require('express');
const cors          = require('cors');
const cookieParser  = require('cookie-parser');
const helmet        = require('helmet');
const { Server: SocketServer } = require('socket.io');
const jwt           = require('jsonwebtoken');
const cookie        = require('cookie');

// ── Modules ──────────────────────────────────────────────────────
const { errorHandler } = require('./middleware/errorHandler');
const engine           = require('./services/engineService');
const binanceStream    = require('./services/binanceStreamService');

// Routes
const userRoutes    = require('./routes/user');
const cryptoRoutes  = require('./routes/cryptoRoutes');
const oneInchRoutes = require('./routes/oneInchRoutes');
const marketRoutes  = require('./routes/marketRoutes');
const tradeRoutes   = require('./routes/tradeRoutes');
const kycRoutes     = require('./routes/kycRoutes');
const adminRoutes   = require('./routes/adminRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const cmcRoutes     = require('./routes/cmcRoutes');

// Background jobs
const staleBotPurge        = require('./jobs/staleBotPurge');
const botOrderCleanup      = require('./jobs/botOrderCleanup');
const staticCoinOscillator = require('./jobs/staticCoinOscillator');

// ── Express ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.corsOrigins, credentials: true }));

// Capture raw body for OxaPay HMAC verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
}));
app.use(cookieParser());

// ── Socket.io ────────────────────────────────────────────────────
const io = new SocketServer(server, {
  cors: { origin: config.corsOrigins, credentials: true },
});

io.use((socket, next) => {
  try {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    const token = cookies.token;
    if (!token) return next();
    const payload = jwt.verify(token, config.secret);
    socket.userId = payload.id;
  } catch (_) {}
  next();
});

io.on('connection', (socket) => {
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
  }

  socket.on('subscribe', ({ userId }) => {
    if (userId && socket.userId && socket.userId === userId) {
      socket.join(`user:${userId}`);
    }
  });

  socket.on('disconnect', () => {});
});

// ── Binance streams ──────────────────────────────────────────────
binanceStream.init(io);

// ── REST routes ──────────────────────────────────────────────────
app.use('/api/user',     userRoutes);
app.use('/api/crypto',   cryptoRoutes);
app.use('/api/1inch',    oneInchRoutes);
app.use('/api/markets',  marketRoutes);
app.use('/api/trade',    tradeRoutes(io));
app.use('/api/kyc',      kycRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/payment',  paymentRoutes);
app.use('/api/trending', marketRoutes); // backwards-compatible alias
app.use('/api/cmc',      cmcRoutes);    // CoinMarketCap-spec public market data

app.use(errorHandler);

// ── Startup ──────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`[server] ${signal} received — shutting down`);
  binanceStream.destroy();
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 10_000).unref();
};

(async () => {
  // Step 1: Purge stale bot orders before loading the book
  try { await staleBotPurge.run(); }
  catch (err) { console.error('[startup] Bot order purge failed:', err.message); }

  // Step 2: Reload open orders into the engine
  try { await engine.recoverFromDB(); }
  catch (err) { console.error('[startup] Order recovery failed:', err.message); }

  // Step 3: Start accepting connections — book is ready
  server.listen(config.port, () => {
    if (config.nodeEnv !== 'test') {
      console.log(`Server listening on port ${config.port} [${config.nodeEnv}]`);
    }

    // Start background jobs
    staticCoinOscillator.start();
    botOrderCleanup.start();

    // Broadcast recovered depth
    for (const pair of engine.getPairs()) {
      const depth = engine.getDepth(pair);
      io.emit('depth_update', { pair, asks: depth.asks, bids: depth.bids });
    }

    process.once('SIGINT',  () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
  });
})();
