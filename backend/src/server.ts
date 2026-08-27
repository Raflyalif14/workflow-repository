import app from './app';
import { ENV } from './config/env';

const startServer = async () => {
  try {
    const port = parseInt(ENV.PORT, 10) || 5000;
    app.listen(port, () => {
      console.log(`Workflow Backend running on port ${port} in [${ENV.NODE_ENV}] mode`);
      console.log(`📡 Healthcheck: http://localhost:${port}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
