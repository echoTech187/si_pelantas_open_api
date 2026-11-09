import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { apiRouter } from './interfaces/http/routes';

export const app = express();

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
app.get('/', (_req, res) => {
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
    database: 'TiDB Cloud Connected',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'OK',
    service: 'SI-PELANTAS KAMSEL MOJOKERTO API',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/v1', apiRouter);
