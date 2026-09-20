import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { hasPermission } from '../../config/permissions.js';
import { getDb } from '../../database/connection.js';
import { projects } from '../../database/schema/projects.js';
import { sites } from '../../database/schema/sites.js';
import { reports, reportSections, reportEntries } from '../../database/schema/reports.js';
import { userProjectAssignments, userSiteAssignments } from '../../database/schema/assignments.js';
import { eq, inArray, count } from 'drizzle-orm';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction } from '../../config/constants.js';

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const projectRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /api/v1/projects
  fastify.get(
    '/',
    {
      preHandler: [requirePermission('projects.view')],
      schema: {
        description: 'List projects (scoped to authenticated user assignments unless permitted to manage)',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = listQuerySchema.parse(request.query);
      const db = getDb();
      const user = request.user!;
      const offset = (query.page - 1) * query.limit;

      let projectList: any[];
      let totalProjects = 0;

      const canViewAll = hasPermission(user.permissions, 'projects.manage') || hasPermission(user.permissions, '*');

      if (canViewAll) {
        const [totalRes] = await db.select({ count: count() }).from(projects);
        totalProjects = Number(totalRes.count);

        projectList = await db
          .select()
          .from(projects)
          .limit(query.limit)
          .offset(offset)
          .orderBy(projects.createdAt);
      } else {
        // Scoped to assigned projects
        const assignments = await db
          .select({ projectId: userProjectAssignments.projectId })
          .from(userProjectAssignments)
          .where(eq(userProjectAssignments.userId, user.id));

        const projectIds = assignments.map((a: { projectId: string }) => a.projectId);

        if (projectIds.length === 0) {
          return reply.send(
            successResponse([], 'No projects assigned', {
              page: query.page,
              limit: query.limit,
              total: 0,
              totalPages: 0,
            })
          );
        }

        const [totalRes] = await db
          .select({ count: count() })
          .from(projects)
          .where(inArray(projects.id, projectIds));
        totalProjects = Number(totalRes.count);

        projectList = await db
          .select()
          .from(projects)
          .where(inArray(projects.id, projectIds))
          .limit(query.limit)
          .offset(offset)
          .orderBy(projects.createdAt);
      }

      return reply.send(
        successResponse(projectList, 'Projects retrieved successfully', {
          page: query.page,
          limit: query.limit,
          total: totalProjects,
          totalPages: Math.ceil(totalProjects / query.limit),
        })
      );
    }
  );

  // GET /api/v1/projects/:id
  fastify.get(
    '/:id',
    {
      preHandler: [requirePermission('projects.view')],
      schema: {
        description: 'Get project details and its associated sites',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const db = getDb();
      const user = request.user!;

      const canViewAll = hasPermission(user.permissions, 'projects.manage') || hasPermission(user.permissions, '*');

      // Verify access for scoped users
      if (!canViewAll) {
        const [assignment] = await db
          .select()
          .from(userProjectAssignments)
          .where(eq(userProjectAssignments.userId, user.id))
          .limit(1);

        if (!assignment || assignment.projectId !== id) {
          return reply.status(403).send(errorResponse('FORBIDDEN', 'You are not assigned to this project'));
        }
      }

      const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

      if (!project) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Project not found'));
      }

      const projectSites = await db.select().from(sites).where(eq(sites.projectId, id));

      return reply.send(
        successResponse(
          {
            ...project,
            sites: projectSites,
          },
          'Project retrieved successfully'
        )
      );
    }
  );

  // POST /api/v1/projects
  fastify.post(
    '/',
    {
      preHandler: [requirePermission('projects.create')],
      schema: {
        description: 'Create a new project',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'projectCode'],
          properties: {
            name: { type: 'string', minLength: 2 },
            projectCode: { type: 'string', minLength: 2 },
            clientName: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'completed'] },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      const db = getDb();

      // Check unique projectCode
      const [existing] = await db.select().from(projects).where(eq(projects.projectCode, body.projectCode)).limit(1);
      if (existing) {
        return reply.status(409).send(errorResponse('CONFLICT', 'Project code already in use'));
      }

      const [newProject] = await db
        .insert(projects)
        .values({
          name: body.name,
          projectCode: body.projectCode,
          clientName: body.clientName || null,
          description: body.description || null,
          status: body.status || 'active',
          startDate: body.startDate || null,
          endDate: body.endDate || null,
        })
        .returning();

      return reply.status(201).send(successResponse(newProject, 'Project created successfully'));
    }
  );

  // PATCH /api/v1/projects/:id
  fastify.patch(
    '/:id',
    {
      preHandler: [requirePermission('projects.edit')],
      schema: {
        description: 'Update project details',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 },
            clientName: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'inactive', 'completed'] },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const db = getDb();

      const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      if (!existing) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Project not found'));
      }

      const [updated] = await db
        .update(projects)
        .set({
          ...body,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();

      return reply.send(successResponse(updated, 'Project updated successfully'));
    }
  );

  // DELETE /api/v1/projects/:id
  fastify.delete(
    '/:id',
    {
      preHandler: [requirePermission('projects.delete')],
      schema: {
        description: 'Delete project and related site records',
        tags: ['Projects'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        querystring: {
          type: 'object',
          properties: {
            cascade: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { cascade } = (request.query as { cascade?: boolean }) || {};
      const user = request.user!;

      const db = getDb();
      const [existing] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      if (!existing) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Project not found'));
      }

      // Check if reports exist for this project
      const [linkedReports] = await db
        .select({ count: count() })
        .from(reports)
        .where(eq(reports.projectId, id));

      const reportCount = Number(linkedReports.count);
      if (reportCount > 0) {
        if (!cascade) {
          return reply
            .status(409)
            .send(
              errorResponse(
                'CONFLICT',
                `Cannot delete project "${existing.name}" because ${reportCount} report(s) are associated with it. Pass cascade=true to force delete the project and all its reports.`
              )
            );
        }
      }

      await db.transaction(async (tx: any) => {
        // 1. If reports exist, cascade delete entries, sections, and reports
        const projectReports = await tx.select({ id: reports.id }).from(reports).where(eq(reports.projectId, id));
        const reportIds = projectReports.map((r: any) => r.id);
        if (reportIds.length > 0) {
          const sections = await tx.select({ id: reportSections.id }).from(reportSections).where(inArray(reportSections.reportId, reportIds));
          const sectionIds = sections.map((s: any) => s.id);
          if (sectionIds.length > 0) {
            await tx.delete(reportEntries).where(inArray(reportEntries.sectionId, sectionIds));
            await tx.delete(reportSections).where(inArray(reportSections.reportId, reportIds));
          }
          await tx.delete(reports).where(eq(reports.projectId, id));
        }

        // 2. Delete site assignments for sites in this project
        const projectSites = await tx.select({ id: sites.id }).from(sites).where(eq(sites.projectId, id));
        const siteIds = projectSites.map((s: any) => s.id);
        if (siteIds.length > 0) {
          await tx.delete(userSiteAssignments).where(inArray(userSiteAssignments.siteId, siteIds));
          await tx.delete(sites).where(eq(sites.projectId, id));
        }

        // 3. Delete project assignments
        await tx.delete(userProjectAssignments).where(eq(userProjectAssignments.projectId, id));

        // 4. Delete project
        await tx.delete(projects).where(eq(projects.id, id));
      });

      await recordAudit({
        userId: user.id,
        action: AuditAction.PROJECT_DELETED,
        entityType: 'project',
        entityId: id,
        metadata: { projectName: existing.name, projectCode: existing.projectCode, cascade: !!cascade, deletedReportsCount: reportCount },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse({ id, deleted: true }, 'Project deleted successfully'));
    }
  );
};
