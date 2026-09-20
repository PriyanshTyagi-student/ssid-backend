import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { hasPermission } from '../../config/permissions.js';
import { getDb } from '../../database/connection.js';
import { users } from '../../database/schema/users.js';
import { projects } from '../../database/schema/projects.js';
import { sites } from '../../database/schema/sites.js';
import { userProjectAssignments, userSiteAssignments } from '../../database/schema/assignments.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction, ProjectStatus, SiteStatus } from '../../config/constants.js';
import { eq, and, inArray, asc } from 'drizzle-orm';

export const assignmentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /api/v1/assignments/my-assignments (For authenticated user / mobile app)
  fastify.get(
    '/my-assignments',
    {
      preHandler: [requirePermission('assignments.view')],
      schema: {
        description: 'Get current authenticated user project and site assignments grouped by project',
        tags: ['Assignments'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const db = getDb();

      // Users with manage permission or wildcard have access to all active projects and sites
      const canManageAll = hasPermission(user.permissions, 'sites.manage') || hasPermission(user.permissions, 'projects.manage') || hasPermission(user.permissions, '*');

      let userProjects: any[];
      let userSites: any[];

      if (canManageAll) {
        userProjects = await db
          .select({
            id: projects.id,
            name: projects.name,
            projectCode: projects.projectCode,
            status: projects.status,
          })
          .from(projects)
          .where(eq(projects.status, ProjectStatus.ACTIVE))
          .orderBy(asc(projects.name));

        userSites = await db
          .select({
            id: sites.id,
            projectId: sites.projectId,
            name: sites.name,
            location: sites.location,
            status: sites.status,
          })
          .from(sites)
          .where(eq(sites.status, SiteStatus.ACTIVE))
          .orderBy(asc(sites.name));
      } else {
        userProjects = await db
          .select({
            id: projects.id,
            name: projects.name,
            projectCode: projects.projectCode,
            status: projects.status,
          })
          .from(userProjectAssignments)
          .innerJoin(projects, eq(userProjectAssignments.projectId, projects.id))
          .where(eq(userProjectAssignments.userId, user.id))
          .orderBy(asc(projects.name));

        userSites = await db
          .select({
            id: sites.id,
            projectId: sites.projectId,
            name: sites.name,
            location: sites.location,
            status: sites.status,
          })
          .from(userSiteAssignments)
          .innerJoin(sites, eq(userSiteAssignments.siteId, sites.id))
          .where(eq(userSiteAssignments.userId, user.id))
          .orderBy(asc(sites.name));
      }

      // Group sites by project
      const groupedProjects = userProjects.map((p) => ({
        ...p,
        sites: userSites.filter((s) => s.projectId === p.id),
      }));

      return reply.send(
        successResponse(
          {
            userId: user.id,
            projects: userProjects,
            sites: userSites,
            groupedProjects,
          },
          'User assignments retrieved successfully'
        )
      );
    }
  );

  // GET /api/v1/assignments/users (List field users with assignment counts)
  fastify.get(
    '/users',
    {
      preHandler: [requirePermission('assignments.manage', 'assignments.view', 'users.view')],
      schema: {
        description: 'List eligible field users with assignment stats',
        tags: ['Assignments'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const db = getDb();

      // Fetch all users eligible for assignments (including custom roles and field staff)
      const fieldUsers = await db
        .select({
          id: users.id,
          name: users.name,
          phoneNumber: users.phoneNumber,
          role: users.role,
          status: users.status,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .orderBy(asc(users.name));

      // Fetch assignments for all users
      const allProjectAssignments = await db
        .select({
          userId: userProjectAssignments.userId,
          projectId: userProjectAssignments.projectId,
          projectName: projects.name,
        })
        .from(userProjectAssignments)
        .innerJoin(projects, eq(userProjectAssignments.projectId, projects.id));

      const allSiteAssignments = await db
        .select({
          userId: userSiteAssignments.userId,
          siteId: userSiteAssignments.siteId,
          siteName: sites.name,
          projectId: sites.projectId,
        })
        .from(userSiteAssignments)
        .innerJoin(sites, eq(userSiteAssignments.siteId, sites.id));

      const userMatrix = fieldUsers.map((u: any) => {
        const userProjects = allProjectAssignments.filter((pa: any) => pa.userId === u.id);
        const userSites = allSiteAssignments.filter((sa: any) => sa.userId === u.id);
        return {
          ...u,
          projectCount: userProjects.length,
          siteCount: userSites.length,
          assignedProjects: userProjects.map((p: any) => ({ id: p.projectId, name: p.projectName })),
          assignedSites: userSites.map((s: any) => ({ id: s.siteId, name: s.siteName, projectId: s.projectId })),
        };
      });

      return reply.send(successResponse(userMatrix, 'Field users retrieved successfully'));
    }
  );

  // GET /api/v1/assignments/users/:userId (Get detailed user assignments)
  fastify.get(
    '/users/:userId',
    {
      preHandler: [requirePermission('assignments.manage', 'assignments.view', 'users.view')],
      schema: {
        description: 'Get user assignments along with all available projects and sites',
        tags: ['Assignments'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const db = getDb();

      const [targetUser] = await db
        .select({
          id: users.id,
          name: users.name,
          phoneNumber: users.phoneNumber,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!targetUser) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'User not found'));
      }

      const assignedProjects = await db
        .select({
          id: projects.id,
          name: projects.name,
          projectCode: projects.projectCode,
        })
        .from(userProjectAssignments)
        .innerJoin(projects, eq(userProjectAssignments.projectId, projects.id))
        .where(eq(userProjectAssignments.userId, userId));

      const assignedSites = await db
        .select({
          id: sites.id,
          name: sites.name,
          location: sites.location,
          projectId: sites.projectId,
        })
        .from(userSiteAssignments)
        .innerJoin(sites, eq(userSiteAssignments.siteId, sites.id))
        .where(eq(userSiteAssignments.userId, userId));

      const allProjects = await db
        .select({ id: projects.id, name: projects.name, projectCode: projects.projectCode, status: projects.status })
        .from(projects)
        .orderBy(asc(projects.name));

      const allSites = await db
        .select({ id: sites.id, name: sites.name, location: sites.location, projectId: sites.projectId, status: sites.status })
        .from(sites)
        .orderBy(asc(sites.name));

      return reply.send(
        successResponse(
          {
            user: targetUser,
            assignedProjectIds: assignedProjects.map((p: any) => p.id),
            assignedSiteIds: assignedSites.map((s: any) => s.id),
            assignedProjects,
            assignedSites,
            allProjects,
            allSites,
          },
          'User assignments retrieved successfully'
        )
      );
    }
  );

  // PUT /api/v1/assignments/users/:userId (Save assignments atomically)
  fastify.put(
    '/users/:userId',
    {
      preHandler: [requirePermission('assignments.manage', 'users.edit')],
      schema: {
        description: 'Update project and site assignments for a user atomically',
        tags: ['Assignments'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            projectIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
            siteIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;

      const { userId } = request.params as { userId: string };
      const body = (request.body as { projectIds?: string[]; siteIds?: string[] }) || {};
      const db = getDb();

      // 1. Validate user exists
      const [targetUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!targetUser) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'User not found'));
      }

      const projectIds = Array.from(new Set(body.projectIds || []));
      const siteIds = Array.from(new Set(body.siteIds || []));

      // 2. Validate projects exist if any provided
      if (projectIds.length > 0) {
        const foundProjects = await db.select({ id: projects.id }).from(projects).where(inArray(projects.id, projectIds));
        if (foundProjects.length !== projectIds.length) {
          return reply.status(400).send(errorResponse('INVALID_PROJECT', 'One or more selected projects do not exist'));
        }
      }

      // 3. Validate sites exist and belong to the assigned projects
      if (siteIds.length > 0) {
        const foundSites = await db.select({ id: sites.id, projectId: sites.projectId }).from(sites).where(inArray(sites.id, siteIds));
        if (foundSites.length !== siteIds.length) {
          return reply.status(400).send(errorResponse('INVALID_SITE', 'One or more selected sites do not exist'));
        }

        // Verify each site belongs to one of the assigned projects
        for (const s of foundSites) {
          if (!projectIds.includes(s.projectId)) {
            return reply.status(400).send(
              errorResponse(
                'SITE_PROJECT_MISMATCH',
                `Site ${s.id} belongs to project ${s.projectId}, which is not in the assigned projects list. Please include the project.`
              )
            );
          }
        }
      }

      // 4. Save assignments atomically inside transaction
      await db.transaction(async (tx: any) => {
        // Clear existing assignments
        await tx.delete(userProjectAssignments).where(eq(userProjectAssignments.userId, userId));
        await tx.delete(userSiteAssignments).where(eq(userSiteAssignments.userId, userId));

        // Insert new project assignments
        if (projectIds.length > 0) {
          await tx.insert(userProjectAssignments).values(
            projectIds.map((pId) => ({
              userId,
              projectId: pId,
            }))
          );
        }

        // Insert new site assignments
        if (siteIds.length > 0) {
          await tx.insert(userSiteAssignments).values(
            siteIds.map((sId) => ({
              userId,
              siteId: sId,
            }))
          );
        }
      });

      // 5. Audit Logging
      await recordAudit({
        userId: user.id,
        action: AuditAction.ASSIGNMENT_UPDATED,
        entityType: 'user_assignments',
        entityId: userId,
        metadata: {
          assignedToUser: targetUser.name,
          assignedToRole: targetUser.role,
          projectCount: projectIds.length,
          siteCount: siteIds.length,
          projectIds,
          siteIds,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(
        successResponse(
          {
            userId,
            projectIds,
            siteIds,
          },
          'Assignments saved successfully'
        )
      );
    }
  );
};
