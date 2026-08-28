require('dotenv').config();
const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const cors    = require('cors');
const helmet  = require('helmet');
const compression = require('compression');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');
const path    = require('path');
const fs      = require('fs');

const { connectDB }    = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initSocketIO } = require('./services/socketService');
const logger           = require('./utils/logger');

// Ensure upload dirs exist
['uploads/screenshots','uploads/audio','uploads/question-media','logs'].forEach(d => {
  const p = path.join(__dirname, '..', d);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const app    = express();
const server = http.createServer(app);

// Render (and most hosting platforms) sit behind a reverse proxy that sets
// X-Forwarded-For. Without this, express-rate-limit throws a validation
// error on every request that hits a rate limiter, breaking login and
// other protected routes with a generic 500 error.
app.set('trust proxy', 1);

const io = new Server(server, {
  cors: {
    origin:      process.env.FRONTEND_URL || 'http://localhost:5173',
    methods:     ['GET','POST'],
    credentials: true,
  },
  maxHttpBufferSize: 10e6,
});
initSocketIO(io);

// ── Middleware ─────────────────────────────────────────────
// Cross-Origin-Resource-Policy defaults to 'same-origin' in helmet, which
// silently blocks <img>/<audio> tags from loading evidence files since the
// frontend (app.proctorai.co.in) and backend (api.proctorai.co.in) are
// different origins — showing as "(blocked)" in the browser network tab,
// not a 404. Relaxing it to 'cross-origin' allows this legitimate case.
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin:         process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials:    true,
  methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(rateLimit({ windowMs: 15*60*1000, max: 20000, message: { error: 'Too many requests' } }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
}

// Static files
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/files/spacebyte', require('./routes/spacebyteFiles'));

// Health check
app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' })
);

// Auth rate limiter — raised well above default since students on the same
// campus network commonly share one public IP; a low per-IP cap here would
// lock out an entire class during a mock test's login rush.
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 500 });

// ── Routes ─────────────────────────────────────────────────
app.use('/api/auth',           authLimiter, require('./routes/auth'));
app.use('/api/users',          require('./routes/users'));
app.use('/api/exams',          require('./routes/exams'));
app.use('/api/exams',          require('./routes/questions'));
app.use('/api/sessions',       require('./routes/sessions'));
app.use('/api/alerts',         require('./routes/alerts'));
app.use('/api/reports',        require('./routes/reports'));
app.use('/api/ai',             require('./routes/ai'));
app.use('/api/dashboard',      require('./routes/dashboard'));
app.use('/api/proctor',        require('./routes/proctor'));
app.use('/api/admin',          require('./routes/admin'));
app.use('/api/licensing',      require('./routes/licensing'));
app.use('/api/org-admin',      require('./routes/orgAdmin'));
app.use('/api/exam-access',    require('./routes/examAccess'));
app.use('/api/question-media', require('./routes/questionMedia'));
app.use('/api/public-exam', require('./routes/publicExamLink'));

// ── NEW v5 routes ──────────────────────────────────────────
app.use('/api/question-banks', require('./routes/questionBanks'));
app.use('/api/behaviour',      require('./routes/behaviour'));
app.use('/api/audio',          require('./routes/audio'));
app.use('/api/evidence',       require('./routes/evidence'));

// ── Error handlers ─────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` })
);
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} ${req.method} ${req.path} — ${err.message}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Server error' : err.message,
  });
});

// ── Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    await connectRedis();
    server.listen(PORT, () => {
      logger.info(`🚀 Proctor AIQ running on http://localhost:${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    logger.error('Startup failed:', err);
    process.exit(1);
  }
}

start();
module.exports = { app, server, io };
