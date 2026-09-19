import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDatabase, closeDatabase } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrate.js';
import type { FastifyInstance } from 'fastify';

describe('Health Check API', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await initDatabase();
    await runMigrations();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('GET /api/v1/health should return 200 and healthy status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
    expect(body.data.database).toBe('connected');
  });

  it('GET /health should redirect or return healthy status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect([200, 302]).toContain(response.statusCode);
  });
});
