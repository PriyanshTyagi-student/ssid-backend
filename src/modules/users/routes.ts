import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { getDb } from '../../database/connection.js';
import { users } from '../../database/schema/users.js';
import { userProjectAssignments, userSiteAssignments } from '../../database/schema/assignments.js';
import { projects } from '../../database/schema/projects.js';
import { sites } from '../../database/schema/sites.js';
import { eq, count, and, or } from 'drizzle-orm';
import { reports } from '../../database/schema/reports.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction, UserRole, UserStatus } from '../../config/constants.js';
import { hashPassword } from '../../utils/password.js';

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
});

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // GET /api/v1/users (Admin only)
  fastify.get(
    '/',
    {
      schema: {
        description: 'List all users with pagination and filtering (Admin only)',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20 },
            role: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can list users'));
      }

      const { page = 1, limit = 20 } = request.query as any;
      const offset = (Number(page) - 1) * Number(limit);
      const db = getDb();

      const [totalRes] = await db.select({ count: count() }).from(users);
      const totalUsers = Number(totalRes.count);

      const userList = await db
        .select({
          id: users.id,
          name: users.name,
          phoneNumber: users.phoneNumber,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
          lastLoginAt: users.lastLoginAt,
        })
        .from(users)
        .limit(Number(limit))
        .offset(offset)
        .orderBy(users.createdAt);

      return reply.send(
        successResponse(userList, 'Users retrieved successfully', {
          page: Number(page),
          limit: Number(limit),
          total: totalUsers,
          totalPages: Math.ceil(totalUsers / Number(limit)),
        })
      );
    }
  );

  // POST /api/v1/users (Admin only)
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new user (Admin only)',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'phoneNumber', 'password', 'role'],
          properties: {
            name: { type: 'string', minLength: 2 },
            phoneNumber: { type: 'string', minLength: 10 },
            password: { type: 'string', minLength: 6 },
            role: { type: 'string', minLength: 2, maxLength: 50 },
            status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can create users'));
      }

      const body = request.body as any;
      const db = getDb();

      // Normalize phone number if needed (+91 or plain)
      let phone = body.phoneNumber.trim();
      if (!phone.startsWith('+')) {
        phone = phone.startsWith('91') && phone.length === 12 ? `+${phone}` : `+91${phone}`;
      }

      // Check existing phone
      const [existing] = await db.select().from(users).where(eq(users.phoneNumber, phone)).limit(1);
      if (existing) {
        return reply.status(409).send(errorResponse('CONFLICT', 'Phone number is already registered'));
      }

      const passwordHash = await hashPassword(body.password);

      const [newUser] = await db
        .insert(users)
        .values({
          name: body.name,
          phoneNumber: phone,
          passwordHash,
          role: body.role || UserRole.SITE_ENGINEER,
          status: body.status || UserStatus.ACTIVE,
        })
        .returning({
          id: users.id,
          name: users.name,
          phoneNumber: users.phoneNumber,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        });

      return reply.status(201).send(successResponse(newUser, 'User created successfully'));
    }
  );

  // PATCH /api/v1/users/:id (Admin only)
  fastify.patch(
    '/:id',
    {
      schema: {
        description: 'Update user status, role, name, or password (Admin only)',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 },
            role: { type: 'string', minLength: 2, maxLength: 50 },
            status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
            password: { type: 'string', minLength: 6 },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can modify users'));
      }

      const body = request.body as any;
      const db = getDb();

      const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'User not found'));
      }

      const updateData: any = {
        updatedAt: new Date(),
      };
      if (body.name) updateData.name = body.name;
      if (body.role) updateData.role = body.role;
      if (body.status) updateData.status = body.status;
      if (body.password) {
        updateData.passwordHash = await hashPassword(body.password);
      }

      const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          name: users.name,
          phoneNumber: users.phoneNumber,
          role: users.role,
          status: users.status,
          updatedAt: users.updatedAt,
        });

      return reply.send(successResponse(updated, 'User updated successfully'));
    }
  );

  // DELETE /api/v1/users/:id (Admin only)
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete user if no reports are authored by them (Admin only)',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can delete users'));
      }

      if (user.id === id) {
        return reply.status(400).send(errorResponse('BAD_REQUEST', 'You cannot delete your own account'));
      }

      const db = getDb();
      const [existing] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'User not found'));
      }

      // Check if reports exist authored or reviewed by this user
      const [linkedReports] = await db
        .select({ count: count() })
        .from(reports)
        .where(or(eq(reports.createdBy, id), eq(reports.reviewedBy, id)));

      if (Number(linkedReports.count) > 0) {
        return reply
          .status(409)
          .send(
            errorResponse(
              'CONFLICT',
              `Cannot delete user "${existing.name}" because ${linkedReports.count} report(s) are linked to them. Please deactivate or suspend this user instead.`
            )
          );
      }

      await db.delete(users).where(eq(users.id, id));

      await recordAudit({
        userId: user.id,
        action: AuditAction.USER_DELETED,
        entityType: 'user',
        entityId: id,
        metadata: { userName: existing.name, userPhone: existing.phoneNumber, role: existing.role },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse({ id, deleted: true }, 'User deleted successfully'));
    }
  );

  // Handler for /me and /profile
  const getProfileHandler = async (request: any, reply: any) => {
    const db = getDb();
    const user = request.user!;

    // Fetch user's assigned projects
    const assignedProjects = await db
      .select({
        id: projects.id,
        name: projects.name,
        projectCode: projects.projectCode,
        status: projects.status,
      })
      .from(userProjectAssignments)
      .innerJoin(projects, eq(userProjectAssignments.projectId, projects.id))
      .where(eq(userProjectAssignments.userId, user.id));

    // Fetch user's assigned sites
    const assignedSites = await db
      .select({
        id: sites.id,
        name: sites.name,
        projectId: sites.projectId,
        location: sites.location,
        status: sites.status,
      })
      .from(userSiteAssignments)
      .innerJoin(sites, eq(userSiteAssignments.siteId, sites.id))
      .where(eq(userSiteAssignments.userId, user.id));

    const primaryProject = assignedProjects[0]?.name ?? null;
    const primarySite = assignedSites[0]?.name ?? null;

    const profile = {
      id: user.id,
      name: user.name,
      phone: user.phoneNumber,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      projectName: primaryProject,
      project_name: primaryProject,
      siteName: primarySite,
      site_name: primarySite,
      projects: assignedProjects,
      sites: assignedSites,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };

    return reply.send({
      success: true,
      user: profile,
      data: { user: profile },
      message: 'User profile retrieved',
    });
  };

  // GET /api/v1/users/me and GET /api/v1/user/profile
  fastify.get('/me', {
    schema: {
      description: 'Get current user profile with site assignments',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
    },
  }, getProfileHandler);

  fastify.get('/profile', {
    schema: {
      description: 'Get current user profile with site assignments (profile alias)',
      tags: ['Users'],
      security: [{ bearerAuth: [] }],
    },
  }, getProfileHandler);

  // PATCH /api/v1/users/me
  fastify.patch(
    '/me',
    {
      schema: {
        description: 'Update current user profile information',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 },
          },
        },
      },
    },
    async (request, reply) => {
      const input = updateProfileSchema.parse(request.body);
      const db = getDb();

      if (input.name) {
        await db
          .update(users)
          .set({ name: input.name, updatedAt: new Date() })
          .where(eq(users.id, request.user!.id));

        await recordAudit({
          userId: request.user!.id,
          action: AuditAction.USER_UPDATED,
          entityType: 'user',
          entityId: request.user!.id,
          metadata: { updatedFields: ['name'] },
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }

      const [updatedUser] = await db.select().from(users).where(eq(users.id, request.user!.id)).limit(1);

      return reply.send(
        successResponse(
          {
            user: {
              id: updatedUser.id,
              name: updatedUser.name,
              phone: updatedUser.phoneNumber,
              role: updatedUser.role,
              status: updatedUser.status,
            },
          },
          'Profile updated successfully'
        )
      );
    }
  );

  // GET /api/v1/users/:id/assignments (Admin / PM only)
  fastify.get(
    '/:id/assignments',
    {
      schema: {
        description: 'Get project and site assignments for a user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions'));
      }

      const { id } = request.params as { id: string };
      const db = getDb();

      const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
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
        .where(eq(userProjectAssignments.userId, id));

      const assignedSites = await db
        .select({
          id: sites.id,
          name: sites.name,
          location: sites.location,
          projectId: sites.projectId,
        })
        .from(userSiteAssignments)
        .innerJoin(sites, eq(userSiteAssignments.siteId, sites.id))
        .where(eq(userSiteAssignments.userId, id));

      const allProjects = await db.select({ id: projects.id, name: projects.name, projectCode: projects.projectCode }).from(projects);
      const allSites = await db.select({ id: sites.id, name: sites.name, location: sites.location, projectId: sites.projectId }).from(sites);

      return reply.send(
        successResponse(
          {
            assignedProjectIds: assignedProjects.map((p: any) => p.id),
            assignedSiteIds: assignedSites.map((s: any) => s.id),
            assignedProjects,
            assignedSites,
            availableProjects: allProjects,
            availableSites: allSites,
          },
          'Assignments retrieved successfully'
        )
      );
    }
  );

  // PUT /api/v1/users/:id/assignments (Admin / PM only)
  fastify.put(
    '/:id/assignments',
    {
      schema: {
        description: 'Update project and site assignments for a user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators and project managers can assign projects'));
      }

      const { id } = request.params as { id: string };
      const body = (request.body as { projectIds?: string[]; siteIds?: string[] }) || {};
      const db = getDb();

      const [targetUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!targetUser) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'User not found'));
      }

      const projectIds = body.projectIds || [];
      const siteIds = body.siteIds || [];

      await db.transaction(async (tx: any) => {
        // Clear existing assignments
        await tx.delete(userProjectAssignments).where(eq(userProjectAssignments.userId, id));
        await tx.delete(userSiteAssignments).where(eq(userSiteAssignments.userId, id));

        // Insert new project assignments
        if (projectIds.length > 0) {
          await tx.insert(userProjectAssignments).values(
            projectIds.map((pId) => ({
              userId: id,
              projectId: pId,
            }))
          );
        }

        // Insert new site assignments
        if (siteIds.length > 0) {
          await tx.insert(userSiteAssignments).values(
            siteIds.map((sId) => ({
              userId: id,
              siteId: sId,
            }))
          );
        }
      });

      await recordAudit({
        userId: user.id,
        action: AuditAction.ASSIGNMENT_CREATED,
        entityType: 'user_assignment',
        entityId: id,
        metadata: { projectCount: projectIds.length, siteCount: siteIds.length },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse({ success: true, projectIds, siteIds }, 'Assignments updated successfully'));
    }
  );
};
