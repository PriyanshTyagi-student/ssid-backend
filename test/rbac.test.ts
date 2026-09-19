import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDatabase, closeDatabase, getDb } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrate.js';
import { seedDatabase } from '../src/database/seed.js';
import { sites } from '../src/database/schema/sites.js';
import { projects } from '../src/database/schema/projects.js';
import { SiteStatus } from '../src/config/constants.js';
import type { FastifyInstance } from 'fastify';

describe('Role-Based Access Control & Assignment Scoping', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let engineerToken: string;
  let unassignedSiteId: string;

  beforeAll(async () => {
    await initDatabase();
    await runMigrations();
    await seedDatabase();
    app = await buildApp();

    // Login Admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '+919876543210', password: 'Admin@123456' },
    });
    adminToken = JSON.parse(adminLogin.payload).data.accessToken;

    // Login Site Engineer
    const engLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '+919123456789', password: 'Site@123456' },
    });
    engineerToken = JSON.parse(engLogin.payload).data.accessToken;

    // Create an unassigned site
    const db = getDb();
    const [project] = await db.select().from(projects).limit(1);
    const [unassignedSite] = await db
      .insert(sites)
      .values({
        projectId: project.id,
        name: 'Tower C - Unassigned Site',
        status: SiteStatus.ACTIVE,
      })
      .returning();
    unassignedSiteId = unassignedSite.id;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('Admin should be able to access /api/v1/audit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/audit',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
  });

  it('Site Engineer should receive 403 when accessing /api/v1/audit', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/audit',
      headers: { Authorization: `Bearer ${engineerToken}` },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('Site Engineer should receive 403 when viewing unassigned site detail', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sites/${unassignedSiteId}`,
      headers: { Authorization: `Bearer ${engineerToken}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('Admin should be able to access any site detail', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sites/${unassignedSiteId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
  });
});
