/**
 * server.js — Application entry point.
 *
 * Wires Express, Socket.io, routes, and background jobs.
 *
 * Important startup behavior:
 * - HTTP server starts immediately.
 * - Database recovery runs after the server is listening.
 * - A slow/unavailable database cannot prevent port 4010
 *   from opening and passing the Kubernetes startup probe.
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

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  cors({
    origin: config.corsOrigins,
    credentials: true,
  })
);

// Capture raw body for OxaPay HMAC verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);

app.use(cookieParser());

// ── Socket.io ────────────────────────────────────────────────────
const io = new SocketServer(server, {
  cors: {
    origin: config.corsOrigins,
    credentials: true,
  },
});

io.use((socket, next) => {
  try {
    const cookies = cookie.parse(
      socket.handshake.headers.cookie || ''
    );

    const token = cookies.token;

    if (!token) {
      return next();
    }

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
    if (
      userId &&
      socket.userId &&
      socket.userId === userId
    ) {
      socket.join(`user:${userId}`);
    }
  });

  socket.on('disconnect', () => {});
});

// ── Binance streams ──────────────────────────────────────────────
try {
  binanceStream.init(io);
} catch (err) {
  console.error(
    '[startup] Binance stream initialization failed:',
    err.message
  );
}

// ── REST routes ──────────────────────────────────────────────────
app.use('/api/user',     userRoutes);
app.use('/api/crypto',   cryptoRoutes);
app.use('/api/1inch',    oneInchRoutes);
app.use('/api/markets',  marketRoutes);
app.use('/api/trade',    tradeRoutes(io));
app.use('/api/kyc',      kycRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/payment',  paymentRoutes);
app.use('/api/trending', marketRoutes);
app.use('/api/cmc',      cmcRoutes);

app.use(errorHandler);

// ── Health endpoint ──────────────────────────────────────────────
// Kubernetes can use this endpoint without depending on DB recovery.
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'avgexchange-backend',
    timestamp: new Date().toISOString(),
  });
});

// ── Shutdown ─────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`[server] ${signal} received — shutting down`);

  try {
    binanceStream.destroy();
  } catch (err) {
    console.error(
      '[server] Binance shutdown error:',
      err.message
    );
  }

  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[server] Forced shutdown after timeout');
    process.exit(0);
  }, 10_000).unref();
};

// ── Background startup tasks ─────────────────────────────────────
const runStartupTasks = async () => {
  console.log('[startup] Background initialization started');

  // Step 1: Purge stale bot orders
  try {
    console.log('[startup] Running stale bot order purge...');

    await Promise.race([
      staleBotPurge.run(),

      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('stale bot purge timeout')),
          30_000
        )
      ),
    ]);

    console.log('[startup] Stale bot order purge completed');
  } catch (err) {
    console.error(
      '[startup] Bot order purge failed:',
      err.message
    );
  }

  // Step 2: Recover open orders from database
  try {
    console.log('[startup] Recovering open orders from database...');

    await Promise.race([
      engine.recoverFromDB(),

      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('database recovery timeout')),
          30_000
        )
      ),
    ]);

    console.log('[startup] Database order recovery completed');
  } catch (err) {
    console.error(
      '[startup] Order recovery failed:',
      err.message
    );
  }

  // Step 3: Start background jobs
  try {
    staticCoinOscillator.start();
    console.log('[startup] Static coin oscillator started');
  } catch (err) {
    console.error(
      '[startup] Static coin oscillator failed:',
      err.message
    );
  }

  try {
    botOrderCleanup.start();
    console.log('[startup] Bot order cleanup started');
  } catch (err) {
    console.error(
      '[startup] Bot order cleanup failed:',
      err.message
    );
  }

  // Step 4: Broadcast recovered depth
  try {
    for (const pair of engine.getPairs()) {
      const depth = engine.getDepth(pair);

      io.emit('depth_update', {
        pair,
        asks: depth.asks,
        bids: depth.bids,
      });
    }

    console.log('[startup] Recovered market depth broadcast completed');
  } catch (err) {
    console.error(
      '[startup] Depth broadcast failed:',
      err.message
    );
  }

  console.log('[startup] Background initialization finished');
};

// ── Start HTTP server FIRST ──────────────────────────────────────
server.listen(config.port, '0.0.0.0', () => {
  console.log(
    `Server listening on port ${config.port} [${config.nodeEnv}]`
  );

  console.log(
    `[server] HTTP server is ready on 0.0.0.0:${config.port}`
  );

  // Register shutdown handlers
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  // IMPORTANT:
  // Do not await startup/database recovery here.
  // Kubernetes must be able to connect to port 4010 immediately.
  runStartupTasks().catch((err) => {
    console.error(
      '[startup] Unexpected background startup error:',
      err
    );
  });
});

// Deployment verification: zero-downtime rollout test
