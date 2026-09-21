import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDatabase, closeDatabase, getDb } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrate.js';
import { seedDatabase } from '../src/database/seed.js';
import { projects } from '../src/database/schema/projects.js';
import { userSiteAssignments } from '../src/database/schema/assignments.js';
import { laborCategories } from '../src/database/schema/labor_categories.js';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

describe('Labor Report Multi-Classification System', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let engineerToken: string;
  let projectId: string;
  let assignedSiteId: string;

  let masonId: string;
  let carpenterId: string;
  let welderId: string;

  beforeAll(async () => {
    await initDatabase();
    await runMigrations();
    await seedDatabase();
    app = await buildApp();

    const db = getDb();
    await db.delete(laborCategories).where(inArray(laborCategories.name, ['Mason (राजमिस्त्री)', 'Carpenter (बढ़ई)', 'Welder (वेल्डर)']));

    // Login Admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '+919876543210', password: 'Admin@123456' },
    });
    adminToken = JSON.parse(adminLogin.payload).data.accessToken;

    // Login Engineer
    const engLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '+919123456789', password: 'Site@123456' },
    });
    engineerToken = JSON.parse(engLogin.payload).data.accessToken;

    const [project] = await db.select().from(projects).limit(1);
    projectId = project.id;

    const [assignment] = await db.select().from(userSiteAssignments).limit(1);
    assignedSiteId = assignment.siteId;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('Admin creates bilingual labor classifications (Mason, Carpenter, Welder)', async () => {
    // 1. Mason (राजमिस्त्री)
    const masonRes = await app.inject({
      method: 'POST',
      url: '/api/v1/labor-categories',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        nameEn: 'Mason',
        nameHi: 'राजमिस्त्री',
        categoryType: 'skilled',
        orderIndex: 1,
        isActive: true,
      },
    });
    expect(masonRes.statusCode).toBe(201);
    const masonData = JSON.parse(masonRes.payload).data;
    expect(masonData.name).toBe('Mason (राजमिस्त्री)');
    expect(masonData.nameEn).toBe('Mason');
    expect(masonData.nameHi).toBe('राजमिस्त्री');
    masonId = masonData.id;

    // 2. Carpenter (बढ़ई)
    const carpRes = await app.inject({
      method: 'POST',
      url: '/api/v1/labor-categories',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        nameEn: 'Carpenter',
        nameHi: 'बढ़ई',
        categoryType: 'skilled',
        orderIndex: 2,
        isActive: true,
      },
    });
    expect(carpRes.statusCode).toBe(201);
    const carpData = JSON.parse(carpRes.payload).data;
    expect(carpData.name).toBe('Carpenter (बढ़ई)');
    carpenterId = carpData.id;

    // 3. Welder (वेल्डर)
    const welderRes = await app.inject({
      method: 'POST',
      url: '/api/v1/labor-categories',
      headers: { Authorization: `Bearer ${adminToken}` },
      payload: {
        nameEn: 'Welder',
        nameHi: 'वेल्डर',
        categoryType: 'custom',
        orderIndex: 3,
        isActive: true,
      },
    });
    expect(welderRes.statusCode).toBe(201);
    const welderData = JSON.parse(welderRes.payload).data;
    expect(welderData.name).toBe('Welder (वेल्डर)');
    welderId = welderData.id;
  });

  it('GET /api/v1/labor-categories returns active classifications with bilingual names', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/labor-categories',
      headers: { Authorization: `Bearer ${engineerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);

    const categories = body.data;
    const mason = categories.find((c: any) => c.id === masonId);
    expect(mason).toBeDefined();
    expect(mason.nameEn).toBe('Mason');
    expect(mason.nameHi).toBe('राजमिस्त्री');
  });

  it('Test 1 — User can create a labor report with 1 classification', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { Authorization: `Bearer ${engineerToken}` },
      payload: {
        reportType: 'labor',
        projectId,
        siteId: assignedSiteId,
        reportDate: '2026-09-21',
        sections: [
          {
            sectionType: 'skilled_labor',
            sectionName: 'Skilled Labor Attendance',
            sortOrder: 0,
            entries: [
              {
                entryData: {
                  categoryId: masonId,
                  trade: 'Mason (राजमिस्त्री)',
                  classificationNameSnapshot: 'Mason (राजमिस्त्री)',
                  categoryType: 'skilled',
                  totalWorkers: 10,
                  presentWorkers: 8,
                  absentWorkers: 2,
                  workingHours: 8,
                  overtimeHours: 1,
                  remarks: 'Good progress',
                },
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.success).toBe(true);
    expect(body.data.reportType).toBe('labor');
  });

  it('Test 2 & 3 — User can create a labor report with multiple classifications (Mason, Carpenter, Welder)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { Authorization: `Bearer ${engineerToken}` },
      payload: {
        reportType: 'labor',
        projectId,
        siteId: assignedSiteId,
        reportDate: '2026-09-22',
        sections: [
          {
            sectionType: 'skilled_labor',
            sectionName: 'Skilled Labor Attendance',
            sortOrder: 0,
            entries: [
              {
                entryData: {
                  categoryId: masonId,
                  trade: 'Mason (राजमिस्त्री)',
                  classificationNameSnapshot: 'Mason (राजमिस्त्री)',
                  categoryType: 'skilled',
                  totalWorkers: 10,
                  presentWorkers: 9,
                  absentWorkers: 1,
                  workingHours: 8,
                  overtimeHours: 0,
                },
                sortOrder: 0,
              },
              {
                entryData: {
                  categoryId: carpenterId,
                  trade: 'Carpenter (बढ़ई)',
                  classificationNameSnapshot: 'Carpenter (बढ़ई)',
                  categoryType: 'skilled',
                  totalWorkers: 5,
                  presentWorkers: 5,
                  absentWorkers: 0,
                  workingHours: 8,
                  overtimeHours: 0,
                },
                sortOrder: 1,
              },
            ],
          },
          {
            sectionType: 'custom_labor',
            sectionName: 'Custom Classifications Attendance',
            sortOrder: 1,
            entries: [
              {
                entryData: {
                  categoryId: welderId,
                  trade: 'Welder (वेल्डर)',
                  classificationNameSnapshot: 'Welder (वेल्डर)',
                  categoryType: 'custom',
                  totalWorkers: 3,
                  presentWorkers: 2,
                  absentWorkers: 1,
                  workingHours: 9,
                  overtimeHours: 1,
                },
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    const report = JSON.parse(res.payload).data;

    // Fetch by ID and verify all 3 entries are persisted
    const detailRes = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/${report.id}`,
      headers: { Authorization: `Bearer ${engineerToken}` },
    });

    expect(detailRes.statusCode).toBe(200);
    const detail = JSON.parse(detailRes.payload).data;
    const entries = detail.sections.flatMap((s: any) => s.entries);
    expect(entries.length).toBe(3);

    const trades = entries.map((e: any) => e.entryData.classificationNameSnapshot);
    expect(trades).toContain('Mason (राजमिस्त्री)');
    expect(trades).toContain('Carpenter (बढ़ई)');
    expect(trades).toContain('Welder (वेल्डर)');
  });

  it('Test 5 — Duplicate classification in the same report is rejected (400 Bad Request)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { Authorization: `Bearer ${engineerToken}` },
      payload: {
        reportType: 'labor',
        projectId,
        siteId: assignedSiteId,
        reportDate: '2026-09-23',
        sections: [
          {
            sectionType: 'skilled_labor',
            sectionName: 'Skilled Labor Attendance',
            sortOrder: 0,
            entries: [
              {
                entryData: {
                  categoryId: masonId,
                  trade: 'Mason (राजमिस्त्री)',
                  totalWorkers: 10,
                  presentWorkers: 8,
                  absentWorkers: 2,
                },
                sortOrder: 0,
              },
              {
                entryData: {
                  categoryId: masonId, // DUPLICATE!
                  trade: 'Mason (राजमिस्त्री)',
                  totalWorkers: 5,
                  presentWorkers: 5,
                  absentWorkers: 0,
                },
                sortOrder: 1,
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toMatch(/Duplicate labor classification detected/);
  });

  it('Test 15 — Attendance validation formula (Present + Absent = Total) is strictly enforced', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { Authorization: `Bearer ${engineerToken}` },
      payload: {
        reportType: 'labor',
        projectId,
        siteId: assignedSiteId,
        reportDate: '2026-09-23',
        sections: [
          {
            sectionType: 'skilled_labor',
            sectionName: 'Skilled Labor Attendance',
            sortOrder: 0,
            entries: [
              {
                entryData: {
                  categoryId: masonId,
                  trade: 'Mason (राजमिस्त्री)',
                  totalWorkers: 10,
                  presentWorkers: 8,
                  absentWorkers: 5, // 8 + 5 != 10 (MISMATCH!)
                },
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toMatch(/Labor attendance mismatch/);
  });

  it('Test 15b — Negative attendance counts are rejected', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { Authorization: `Bearer ${engineerToken}` },
      payload: {
        reportType: 'labor',
        projectId,
        siteId: assignedSiteId,
        reportDate: '2026-09-23',
        sections: [
          {
            sectionType: 'skilled_labor',
            sectionName: 'Skilled Labor Attendance',
            sortOrder: 0,
            entries: [
              {
                entryData: {
                  categoryId: masonId,
                  trade: 'Mason (राजमिस्त्री)',
                  totalWorkers: -2,
                  presentWorkers: 0,
                  absentWorkers: -2,
                },
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toMatch(/cannot be negative/);
  });

  it('Test 7 — Deactivated classification cannot be selected for new reports', async () => {
    // 1. Deactivate Welder
    const deactRes = await app.inject({
      method: 'PATCH',
      url: `/api/v1/labor-categories/${welderId}/deactivate`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(deactRes.statusCode).toBe(200);

    // 2. Attempt to create new report with deactivated Welder
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { Authorization: `Bearer ${engineerToken}` },
      payload: {
        reportType: 'labor',
        projectId,
        siteId: assignedSiteId,
        reportDate: '2026-09-24',
        sections: [
          {
            sectionType: 'custom_labor',
            sectionName: 'Custom Classifications Attendance',
            sortOrder: 0,
            entries: [
              {
                entryData: {
                  categoryId: welderId,
                  trade: 'Welder (वेल्डर)',
                  totalWorkers: 3,
                  presentWorkers: 3,
                  absentWorkers: 0,
                },
                sortOrder: 0,
              },
            ],
          },
        ],
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.error?.message || body.message).toMatch(/is deactivated and cannot be selected for new reports/);

    // Reactivate Welder for future tests
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/labor-categories/${welderId}/reactivate`,
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  });

  it('Test 17 — Excel / CSV export includes each classification separately with correct totals', async () => {
    const exportRes = await app.inject({
      method: 'GET',
      url: '/api/v1/reports/export?reportType=labor',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(exportRes.statusCode).toBe(200);
    const body = JSON.parse(exportRes.payload);
    expect(body.success).toBe(true);
    expect(body.data.csv).toBeDefined();

    const csv: string = body.data.csv;
    expect(csv).toContain('Mason (राजमिस्त्री)');
    expect(csv).toContain('Carpenter (बढ़ई)');
    expect(csv).toContain('TOTALS');
  });
});
