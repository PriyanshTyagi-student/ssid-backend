import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { initDatabase, closeDatabase, getDb } from '../src/database/connection.js';
import { runMigrations } from '../src/database/migrate.js';
import { seedDatabase } from '../src/database/seed.js';
import { projects } from '../src/database/schema/projects.js';
import { sites } from '../src/database/schema/sites.js';
import { userSiteAssignments } from '../src/database/schema/assignments.js';
import { generateReportNumber } from '../src/utils/reportNumber.js';
import { ReportType } from '../src/config/constants.js';
import type { FastifyInstance } from 'fastify';

describe('Report Number Generation', () => {
  it('should format report numbers correctly', () => {
    const d = new Date(2026, 8, 18); // Sept 18 2026
    expect(generateReportNumber(ReportType.MATERIAL, d, 1)).toBe('MR-20260918-0001');
    expect(generateReportNumber(ReportType.LABOR, d, 42)).toBe('LR-20260918-0042');
    expect(generateReportNumber(ReportType.MACHINERY, d, 105)).toBe('MCR-20260918-0105');
  });
});

describe('Reports API & State Machine', () => {
  let app: FastifyInstance;
  let engineerToken: string;
  let projectId: string;
  let assignedSiteId: string;
  let createdReportId: string;

  beforeAll(async () => {
    await initDatabase();
    await runMigrations();
    await seedDatabase();
    app = await buildApp();

    // Login Engineer
    const engLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone: '+919123456789', password: 'Site@123456' },
    });
    engineerToken = JSON.parse(engLogin.payload).data.accessToken;

    const db = getDb();
    const [project] = await db.select().from(projects).limit(1);
    projectId = project.id;

    const [assignment] = await db.select().from(userSiteAssignments).limit(1);
    assignedSiteId = assignment.siteId;
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
  });

  it('POST /api/v1/reports should create a new draft report with sections and entries', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { Authorization: `Bearer ${engineerToken}` },
      payload: {
        reportType: 'material',
        projectId,
        siteId: assignedSiteId,
        reportDate: '2026-09-18',
        sections: [
          {
            sectionType: 'material_received',
            sectionName: 'Material Received Today',
            sortOrder: 1,
            entries: [
              {
                entryData: {
                  item: 'OPC 53 Cement',
                  quantity: 200,
                  unit: 'Bags',
                  supplier: 'Ultratech',
                },
                sortOrder: 1,
              },
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('draft');
    expect(body.data.reportNumber).toMatch(/^MR-20260918-\d{4}$/);
    createdReportId = body.data.id;
  });

  it('GET /api/v1/reports/:id should retrieve the created report with its sections and entries', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/${createdReportId}`,
      headers: { Authorization: `Bearer ${engineerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.sections).toHaveLength(1);
    expect(body.data.sections[0].entries).toHaveLength(1);
    expect(body.data.sections[0].entries[0].entryData.item).toBe('OPC 53 Cement');
  });

  it('POST /api/v1/reports/:id/submit should transition report from draft to submitted', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/reports/${createdReportId}/submit`,
      headers: { Authorization: `Bearer ${engineerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('submitted');
    expect(body.data.submittedAt).toBeDefined();
  });

  it('Submitting an already submitted report should be rejected by state machine', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/reports/${createdReportId}/submit`,
      headers: { Authorization: `Bearer ${engineerToken}` },
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('STATE_ERROR');
  });
});
