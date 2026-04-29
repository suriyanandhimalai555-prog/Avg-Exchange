require('dotenv').config();
const http   = require('http');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server: SocketServer } = require('socket.io');
const { errorHandler } = require('./middleware/errorMiddleware');
const engine = require('./services/engineService');
const db     = require('./db');
const userRoutes = require('./routes/user');
const cryptoRoutes = require('./routes/cryptoRoutes');
const oneInchRoutes = require('./routes/oneInchRoutes');
const marketRoutes = require('./routes/marketRoutes');
const tradeRoutes = require('./routes/tradeRoutes');
const kycRoutes   = require('./routes/kycRoutes');

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

// ── REST Routes ───────────────────────────────────────────────
app.use('/api/user',    userRoutes);
app.use('/api/crypto',  cryptoRoutes);
app.use('/api/1inch',   oneInchRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/trade',   tradeRoutes(io));
app.use('/api/kyc',     kycRoutes);

// Backwards-compatible alias
app.use('/api/trending', marketRoutes);

app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log(`Server listening on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  }

  // Reload open orders into memory so the engine state survives restarts
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

  // Clean shutdown — cancel all open orders so the book is empty on next start
  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received — cancelling open orders and shutting down…`);
    try {
      await db.query(
        `UPDATE orders SET status = 'cancelled', updated_at = NOW()
          WHERE status IN ('open', 'partially_filled')`
      );
      console.log('[server] All open orders cancelled');
    } catch (err) {
      console.error('[server] Failed to cancel orders on shutdown:', err.message);
    }
    server.close(() => process.exit(0));
  };

  process.once('SIGINT',  () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
});
