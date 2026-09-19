import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import * as schema from './schema/index.js';

let dbInstance: any = null;
let rawClient: any = null;
let isConnected = false;

export async function initDatabase() {
  if (dbInstance) return { db: dbInstance, client: rawClient };

  if (env.DATABASE_URL && env.DATABASE_URL.trim() !== '') {
    logger.info('[DATABASE] Connecting to external PostgreSQL database...');
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
    });

    try {
      const client = await pool.connect();
      client.release();
      isConnected = true;
      logger.info('[DATABASE] Connected to external PostgreSQL successfully');
      rawClient = pool;
      dbInstance = drizzlePg(pool, { schema });
      return { db: dbInstance, client: pool };
    } catch (err) {
      logger.error({ err }, '[DATABASE] Failed to connect to external PostgreSQL');
      throw err;
    }
  } else {
    // Zero-dependency embedded PostgreSQL (PGLite)
    const dataDir = path.resolve(process.cwd(), env.DATABASE_DIR);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    logger.info(`[DATABASE] Initializing embedded PostgreSQL (PGLite) at ${dataDir}...`);
    const staleFiles = ['postmaster.pid', '.s.PGSQL.5432.lock', '.s.PGSQL.5432.lock.out'];
    for (const file of staleFiles) {
      const filePath = path.join(dataDir, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          logger.info(`[DATABASE] Removed stale ${file} file`);
        } catch (e) {
          logger.warn({ err: e }, `[DATABASE] Failed to remove stale ${file}`);
        }
      }
    }
    const pglite = new PGlite(dataDir);
    await pglite.waitReady;
    isConnected = true;
    logger.info('[DATABASE] Embedded PostgreSQL is ready');

    rawClient = pglite;
    dbInstance = drizzlePglite(pglite, { schema });
    return { db: dbInstance, client: pglite };
  }
}

export function getDb() {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

export function isDbConnected(): boolean {
  return isConnected;
}

export async function closeDatabase() {
  if (rawClient) {
    if (typeof rawClient.end === 'function') {
      await rawClient.end();
    } else if (typeof rawClient.close === 'function') {
      await rawClient.close();
    }
    isConnected = false;
    dbInstance = null;
    rawClient = null;
    logger.info('[DATABASE] Database connection closed');
  }
}
