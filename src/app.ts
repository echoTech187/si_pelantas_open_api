import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { apiRouter } from './interfaces/http/routes';

export const app = express();

// Trust proxy for Vercel Serverless environment
app.set('trust proxy', 1);

// 1. Security Headers (Helmet) & CORS
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2. Rate Limiter Protection
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 150 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Terlalu banyak permintaan dari IP ini, silakan coba beberapa saat lagi.',
  },
});
app.use('/api/', apiLimiter);

// 3. Body Parser dengan batas ukuran payload
app.use(express.json({ limit: '2mb' }));

// 4. Healthcheck & Routes
app.all(['/', '/api', '/api/'], (_req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'SI-PELANTAS KAMSEL MOJOKERTO REST API',
    endpoints: {
      health: '/health',
      policeAuth: '/api/v1/police/auth/login',
      bkAuth: '/api/v1/school-bk/auth/login',
      violationTypes: '/api/v1/police/violation-types',
      schools: '/api/v1/police/schools',
    },
    apkDownloads: {
      polriApk: 'https://si-pelantas-open-api.vercel.app/downloads/sipelantas-polri.apk',
      bkApk: 'https://si-pelantas-open-api.vercel.app/downloads/sipelantas-bk.apk',
      shortcutPolri: 'https://si-pelantas-open-api.vercel.app/download/polri',
      shortcutBk: 'https://si-pelantas-open-api.vercel.app/download/bk',
    },
    database: 'TiDB Cloud Connected',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Shortcut redirect for APK downloads
app.get('/download/polri', (_req, res) => {
  res.redirect('/downloads/sipelantas-polri.apk');
});

app.get('/download/bk', (_req, res) => {
  res.redirect('/downloads/sipelantas-bk.apk');
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'SI-PELANTAS KAMSEL MOJOKERTO API',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1', apiRouter);

// 5. Fallback 404 Handler for undefined API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.url} tidak ditemukan di server SI-PELANTAS Open API.`,
    availableEndpoints: {
      root: '/',
      health: '/health',
      policeLogin: '/api/v1/police/auth/login',
      bkLogin: '/api/v1/school-bk/auth/login',
      violationTypes: '/api/v1/police/violation-types',
      schools: '/api/v1/police/schools',
    },
  });
});

// 6. Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    success: false,
    message: 'Terjadi kesalahan internal pada server.',
    error: err?.message || 'Internal Server Error',
  });
});
