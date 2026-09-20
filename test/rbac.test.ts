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

  it('Custom role: enforces dynamic permissions and updates instantaneously', async () => {
    const db = getDb();
    const { users } = await import('../src/database/schema/users.js');
    const { roles } = await import('../src/database/schema/roles.js');
    const { hashPassword } = await import('../src/utils/password.js');
    const { eq } = await import('drizzle-orm');

    const uniqueSuffix = Date.now().toString().slice(-6);
    const roleSlug = `auditor_${uniqueSuffix}`;
    const userPhone = `+9198${uniqueSuffix}12`;

    // 1. Create a custom role with only view permissions
    const createRoleRes = await app.inject({
      method: 'POST',
      url: '/api/v1/roles',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        name: `Auditor ${uniqueSuffix}`,
        slug: roleSlug,
        description: 'Read-only compliance auditor role',
        permissions: ['projects.view', 'reports.view'],
      },
    });
    expect(createRoleRes.statusCode).toBe(201);
    const roleId = JSON.parse(createRoleRes.payload).data.id;

    // 2. Create a user assigned to this custom role
    const passwordHash = await hashPassword('Auditor@123456');
    const [auditorUser] = await db
      .insert(users)
      .values({
        name: 'Auditor User',
        phoneNumber: userPhone,
        passwordHash,
        role: roleSlug,
        status: 'active',
      })
      .returning();

    // 3. Login as the auditor user
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: userPhone, password: 'Auditor@123456' },
    });
    expect(loginRes.statusCode).toBe(200);
    const auditorToken = JSON.parse(loginRes.payload).data.accessToken;

    // 4. Verify profile reflects permissions
    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meData = JSON.parse(meRes.payload).data.user;
    expect(meData.permissions).toContain('projects.view');
    expect(meData.permissions).toContain('reports.view');

    // 5. Auditor CAN list projects
    const listProjectsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/projects',
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    expect(listProjectsRes.statusCode).toBe(200);

    // 6. Auditor CANNOT create a project (missing projects.create) -> 403
    const createProjectRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { Authorization: `Bearer ${auditorToken}` },
      payload: {
        name: `Unauthorized Project ${uniqueSuffix}`,
        projectCode: `PRJ-UNAUTH-${uniqueSuffix}`,
      },
    });
    expect(createProjectRes.statusCode).toBe(403);
    expect(JSON.parse(createProjectRes.payload).error.code).toBe('FORBIDDEN');

    // 7. Dynamically grant projects.create to the custom role
    const updateRoleRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/roles/${roleId}`,
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        permissions: ['projects.view', 'projects.create', 'reports.view'],
      },
    });
    expect(updateRoleRes.statusCode).toBe(200);

    // 8. Auditor CAN NOW create project IMMEDIATELY with same token!
    const createProjectAllowedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { Authorization: `Bearer ${auditorToken}` },
      payload: {
        name: `Authorized Project ${uniqueSuffix}`,
        projectCode: `PRJ-AUTH-${uniqueSuffix}`,
      },
    });
    expect(createProjectAllowedRes.statusCode).toBe(201);
    const createdProj = JSON.parse(createProjectAllowedRes.payload).data;
    expect(createdProj.name).toBe(`Authorized Project ${uniqueSuffix}`);

    // 9. Auditor CANNOT delete projects (still missing projects.delete) -> 403
    const deleteProjectRes = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${createdProj.id}`,
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    expect(deleteProjectRes.statusCode).toBe(403);

    // Cleanup created project as Admin
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/${createdProj.id}`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    // Cleanup auditor user and role
    await db.delete(users).where(eq(users.id, auditorUser.id));
    await db.delete(roles).where(eq(roles.id, roleId));
  });
});

