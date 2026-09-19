import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { getDb } from '../../database/connection.js';
import { projects } from '../../database/schema/projects.js';
import { sites } from '../../database/schema/sites.js';
import { userProjectAssignments } from '../../database/schema/assignments.js';
import { eq, inArray, count } from 'drizzle-orm';
import { successResponse, errorResponse } from '../../utils/response.js';
import { UserRole } from '../../config/constants.js';

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
      schema: {
        description: 'List projects (scoped to authenticated user assignments)',
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

      if (user.role === UserRole.ADMIN || user.role === UserRole.PROJECT_MANAGER) {
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

      // Verify access for non-admin
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
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
      schema: {
        description: 'Create a new project (Admin or Project Manager)',
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
      const user = request.user!;
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions to create projects'));
      }

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
      const user = request.user!;
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions to modify projects'));
      }

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
};
