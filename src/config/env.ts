import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('*'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('sipelantas_mojokerto'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_SSL: z.string().transform((v) => v === 'true').default('false'),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_EXPIRES_IN: z.string().default('8h'),
  KAMSEL_WARNING_THRESHOLD: z.coerce.number().default(5),
  KAMSEL_VISIT_THRESHOLD: z.coerce.number().default(7),
  FIREBASE_ENABLED: z.string().transform((v) => v === 'true').default('false'),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  WABLAS_ENABLED: z.string().transform((v) => v === 'true').default('false'),
  WABLAS_API_URL: z.string().url().default('https://pati.wablas.com/api/v2/send-message'),
  WABLAS_API_TOKEN: z.string().optional(),
  WABLAS_SECRET_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
