import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './database/connection.js';
import { runMigrations } from './database/migrate.js';
import { seedDatabase } from './database/seed.js';

async function startServer() {
  try {
    logger.info('[STARTUP] Initializing database and running migrations...');
    await initDatabase();
    await runMigrations();

    // Note: Automatic seeding disabled. Application starts with zero demo data.
    // Database can be manually seeded with npm run db:seed if needed for tests.

    const app = await buildApp();

    await app.listen({
      port: env.PORT,
      host: env.HOST, // 0.0.0.0 allows LAN/Wi-Fi devices (e.g. mobile app) to connect
    });

    logger.info(`🚀 [SERVER] Backend API running at http://${env.HOST}:${env.PORT}`);
    logger.info(`📖 [DOCS] API Documentation available at http://${env.HOST}:${env.PORT}/docs`);
    logger.info(`🏥 [HEALTH] Health endpoint ready at http://${env.HOST}:${env.PORT}/api/v1/health`);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`[SHUTDOWN] Received ${signal}. Closing server gracefully...`);
      await app.close();
      await closeDatabase();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    logger.fatal({ err }, '❌ [FATAL] Server failed to start');
    process.exit(1);
  }
}

startServer();
