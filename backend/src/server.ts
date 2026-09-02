import { Server } from 'http';
import app from './app';
import { ENV } from './config/env';
import { TelegramRetryWorker } from './services/telegram-retry-worker.service';

let server: Server | null = null;
let isShuttingDown = false;

const shutdown = (exitCode: number): void => {
  if (isShuttingDown) return;

  isShuttingDown = true;
  TelegramRetryWorker.stop();

  if (!server) {
    process.exit(exitCode);
    return;
  }

  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server.');
      process.exit(1);
      return;
    }

    process.exit(exitCode);
  });
};

const startServer = async () => {
  try {
    const port = parseInt(ENV.PORT, 10) || 5000;
    server = app.listen(port, () => {
      console.log(`Workflow Backend running on port ${port} in [${ENV.NODE_ENV}] mode`);
      console.log(`📡 Healthcheck: http://localhost:${port}/api/health`);
      TelegramRetryWorker.start();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

startServer();
