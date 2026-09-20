import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDatabase, closeDatabase, getDb } from '../src/database/connection.js';
import { seedDatabase } from '../src/database/seed.js';
import type { FastifyInstance } from 'fastify';

describe('Roles and Classifications Management', () => {
  let app: FastifyInstance;
  let adminToken: string;

  beforeAll(async () => {
    await initDatabase();
    await seedDatabase();
    app = await buildApp();

    // Login as Admin
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        phone: '+919876543210',
        password: 'Admin@123456',
      },
    });

    const body = JSON.parse(loginRes.body);
    adminToken = body.accessToken || body.token;
  });

  afterAll(async () => {
    await app?.close();
    await closeDatabase();
  });

  it('should retrieve the permissions catalog', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/roles/permissions',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('should list all roles including default system roles', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/roles',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    const slugs = body.data.map((r: any) => r.slug);
    expect(slugs).toContain('admin');
    expect(slugs).toContain('project_manager');
    expect(slugs).toContain('site_engineer');
  });

  it('should create, update, and delete a custom role', async () => {
    // 1. Create custom role
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/roles',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Safety Inspector',
        slug: 'safety_inspector_test',
        description: 'Audits safety compliance across sites',
        permissions: ['reports.view', 'sites.view'],
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdRole = JSON.parse(createRes.body).data;
    expect(createdRole.name).toBe('Safety Inspector');
    expect(createdRole.slug).toBe('safety_inspector_test');
    expect(createdRole.isSystem).toBe(false);

    // 2. Update custom role
    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/roles/${createdRole.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Senior Safety Inspector',
        permissions: ['reports.view', 'reports.review', 'sites.view'],
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updatedRole = JSON.parse(updateRes.body).data;
    expect(updatedRole.name).toBe('Senior Safety Inspector');
    expect(updatedRole.permissions).toContain('reports.review');

    // 3. Delete custom role
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/roles/${createdRole.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(deleteRes.statusCode).toBe(200);
  });

  it('should protect system roles from deletion', async () => {
    // Find admin role
    const listRes = await app.inject({
      method: 'GET',
      url: '/api/v1/roles',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const adminRole = JSON.parse(listRes.body).data.find((r: any) => r.slug === 'admin');
    expect(adminRole).toBeDefined();

    // The admin role currently has the admin user assigned, so it should return 409 ROLE_IN_USE
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/roles/${adminRole.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(deleteRes.statusCode).toBe(409);
    expect(JSON.parse(deleteRes.body).error.code).toBe('ROLE_IN_USE');
  });

  it('should create, update, and delete a custom labor classification', async () => {
    // 1. Create custom classification
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/labor-categories/classifications',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Heavy Machinery Operators',
        code: 'heavy_machinery_test',
        description: 'Excavator and crane operators',
      },
    });

    expect(createRes.statusCode).toBe(201);
    const createdClass = JSON.parse(createRes.body).data;
    expect(createdClass.code).toBe('heavy_machinery_test');
    expect(createdClass.isSystem).toBe(false);

    // 2. Update classification
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/v1/labor-categories/classifications/heavy_machinery_test',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Heavy Equipment & Machinery',
      },
    });

    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).data.name).toBe('Heavy Equipment & Machinery');

    // 3. Delete classification
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/labor-categories/classifications/heavy_machinery_test',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(deleteRes.statusCode).toBe(200);
  });

  it('should allow deletion of any classification including system ones', async () => {
    // 1. Create a classification marked with isSystem=true (or standard)
    const db = getDb();
    const { laborClassifications } = await import('../src/database/schema/labor_classifications.js');
    await db
      .insert(laborClassifications)
      .values({
        name: 'System Test Classification',
        code: 'system_test_class',
        description: 'Test system classification deletion',
        isSystem: true,
      })
      .onConflictDoNothing();

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/api/v1/labor-categories/classifications/system_test_class',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(deleteRes.statusCode).toBe(200);
    const body = JSON.parse(deleteRes.body);
    expect(body.success).toBe(true);
  });
});
