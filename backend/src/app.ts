import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { ENV } from './config/env';
import apiRoutes from './routes';
import { errorHandler } from './middlewares/error.middleware';

const app: Application = express();
const allowedOrigins = ENV.CORS_ORIGIN.split(',').map((origin) => origin.trim());
const isLocalDevOrigin = (origin: string) =>
  ENV.NODE_ENV === 'development' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

// Middlewares
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || isLocalDevOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.use('/api', apiRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
