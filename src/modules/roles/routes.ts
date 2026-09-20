import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { getDb } from '../../database/connection.js';
import { roles } from '../../database/schema/roles.js';
import { users } from '../../database/schema/users.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction, UserRole } from '../../config/constants.js';
import { eq, sql, desc, asc } from 'drizzle-orm';

export const PERMISSION_CATALOG = [
  {
    module: 'Reports',
    description: 'Daily construction site logs and trade attendance',
    permissions: [
      { id: 'reports.view', label: 'View Reports', description: 'Browse and view submitted daily site reports' },
      { id: 'reports.create', label: 'Create Reports', description: 'Create and author new daily draft reports' },
      { id: 'reports.review', label: 'Review Reports', description: 'Move reports to Under Review state' },
      { id: 'reports.approve', label: 'Approve Reports', description: 'Grant final approval to submitted reports' },
      { id: 'reports.reject', label: 'Reject Reports', description: 'Reject reports with required rejection feedback' },
      { id: 'reports.delete', label: 'Delete Reports', description: 'Permanently remove reports from system' },
      { id: 'reports.export', label: 'Export Reports', description: 'Export daily site logs to Excel or CSV' },
    ],
  },
  {
    module: 'Projects',
    description: 'Construction projects and master records',
    permissions: [
      { id: 'projects.view', label: 'View Projects', description: 'Browse projects list and details' },
      { id: 'projects.manage', label: 'Manage Projects', description: 'Create, modify, archive, and delete projects' },
    ],
  },
  {
    module: 'Sites',
    description: 'Individual work locations and job sites',
    permissions: [
      { id: 'sites.view', label: 'View Sites', description: 'Browse sites list and site details' },
      { id: 'sites.manage', label: 'Manage Sites', description: 'Create, edit, and delete job sites' },
    ],
  },
  {
    module: 'Users & Team',
    description: 'User access, credentials, and site assignments',
    permissions: [
      { id: 'users.view', label: 'View Users', description: 'View staff directory and assignments' },
      { id: 'users.manage', label: 'Manage Users', description: 'Provision users, change roles, assign sites and delete accounts' },
    ],
  },
  {
    module: 'Labor Categories',
    description: 'Trade classifications and labor rate masters',
    permissions: [
      { id: 'labor_categories.view', label: 'View Labor Categories', description: 'Inspect available trades and classifications' },
      { id: 'labor_categories.manage', label: 'Manage Labor Categories', description: 'Create, edit, rename, and organize trades & classifications' },
    ],
  },
  {
    module: 'System & Audits',
    description: 'Security logs, platform health, and configuration',
    permissions: [
      { id: 'settings.view', label: 'View Settings & Audits', description: 'Access audit trail, export logs, and platform settings' },
    ],
  },
];

export const roleRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  // 1. GET /api/v1/roles/permissions - Catalog of permissions
  fastify.get('/permissions', async (_req, reply) => {
    return reply.send(successResponse(PERMISSION_CATALOG, 'Permissions catalog retrieved successfully'));
  });

  // 2. GET /api/v1/roles - List all roles with user count
  fastify.get('/', async (_req, reply) => {
    const db = getDb();

    const allRoles = await db
      .select({
        id: roles.id,
        name: roles.name,
        slug: roles.slug,
        description: roles.description,
        permissions: roles.permissions,
        isSystem: roles.isSystem,
        createdAt: roles.createdAt,
        updatedAt: roles.updatedAt,
        userCount: sql<number>`count(${users.id})::int`,
      })
      .from(roles)
      .leftJoin(users, eq(users.role, roles.slug))
      .groupBy(roles.id)
      .orderBy(desc(roles.isSystem), asc(roles.name));

    return reply.send(successResponse(allRoles, 'Roles retrieved successfully'));
  });

  // 3. GET /api/v1/roles/:id - Get role details
  fastify.get(
    '/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const db = getDb();

      const [role] = await db
        .select({
          id: roles.id,
          name: roles.name,
          slug: roles.slug,
          description: roles.description,
          permissions: roles.permissions,
          isSystem: roles.isSystem,
          createdAt: roles.createdAt,
          updatedAt: roles.updatedAt,
          userCount: sql<number>`count(${users.id})::int`,
        })
        .from(roles)
        .leftJoin(users, eq(users.role, roles.slug))
        .where(eq(roles.id, id))
        .groupBy(roles.id)
        .limit(1);

      if (!role) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Role not found'));
      }

      return reply.send(successResponse(role, 'Role retrieved successfully'));
    }
  );

  // 4. POST /api/v1/roles - Create custom role (Admin only)
  fastify.post(
    '/',
    {
      preHandler: [requireRoles(UserRole.ADMIN)],
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 },
            slug: { type: 'string', minLength: 2, maxLength: 50 },
            description: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const body = request.body as {
        name: string;
        slug?: string;
        description?: string;
        permissions?: string[];
      };

      const name = body.name.trim();
      let slug = (body.slug || '').trim().toLowerCase();

      // Auto-generate slug if not provided
      if (!slug) {
        slug = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');
      }

      // Check if slug is reserved or already taken
      const db = getDb();
      const [existing] = await db.select().from(roles).where(eq(roles.slug, slug)).limit(1);
      if (existing) {
        return reply.status(409).send(errorResponse('ROLE_EXISTS', `A role with identifier "${slug}" already exists`));
      }

      const permissions = Array.isArray(body.permissions) ? body.permissions : [];

      const [newRole] = await db
        .insert(roles)
        .values({
          name,
          slug,
          description: body.description?.trim() || null,
          permissions,
          isSystem: false,
        })
        .returning();

      await recordAudit({
        userId: user.id,
        action: AuditAction.ROLE_CREATED,
        entityType: 'role',
        entityId: newRole.id,
        metadata: { name: newRole.name, slug: newRole.slug, permissionsCount: permissions.length },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(201).send(successResponse(newRole, 'Custom role created successfully'));
    }
  );

  // 5. PUT /api/v1/roles/:id - Update role (Admin only)
  fastify.put(
    '/:id',
    {
      preHandler: [requireRoles(UserRole.ADMIN)],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 },
            slug: { type: 'string', minLength: 2, maxLength: 50 },
            description: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        slug?: string;
        description?: string;
        permissions?: string[];
      };

      const db = getDb();
      const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
      if (!existing) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Role not found'));
      }

      const updateData: Partial<typeof roles.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (body.name !== undefined) {
        updateData.name = body.name.trim();
      }

      if (body.description !== undefined) {
        updateData.description = body.description.trim() || null;
      }

      if (body.permissions !== undefined) {
        updateData.permissions = body.permissions;
      }

      // Slug can only be changed on non-system roles
      if (body.slug !== undefined && body.slug.trim() !== existing.slug) {
        if (existing.isSystem) {
          return reply.status(400).send(errorResponse('CANNOT_MODIFY_SYSTEM_ROLE', 'Cannot alter the identifier of system roles'));
        }

        const newSlug = body.slug.trim().toLowerCase();
        const [conflict] = await db.select().from(roles).where(eq(roles.slug, newSlug)).limit(1);
        if (conflict) {
          return reply.status(409).send(errorResponse('SLUG_CONFLICT', `Role slug "${newSlug}" is already in use`));
        }

        // Update assigned users if slug changes
        await db.update(users).set({ role: newSlug }).where(eq(users.role, existing.slug));
        updateData.slug = newSlug;
      }

      const [updated] = await db.update(roles).set(updateData).where(eq(roles.id, id)).returning();

      await recordAudit({
        userId: user.id,
        action: AuditAction.ROLE_UPDATED,
        entityType: 'role',
        entityId: id,
        metadata: {
          previous: { name: existing.name, slug: existing.slug },
          updated: { name: updated.name, slug: updated.slug },
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse(updated, 'Role updated successfully'));
    }
  );

  // 6. DELETE /api/v1/roles/:id - Delete custom role (Admin only)
  fastify.delete(
    '/:id',
    {
      preHandler: [requireRoles(UserRole.ADMIN)],
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const db = getDb();

      const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
      if (!role) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Role not found'));
      }

      // 1. Cannot delete system roles
      if (role.isSystem) {
        return reply.status(403).send(errorResponse('SYSTEM_ROLE_PROTECTED', 'Default system roles cannot be deleted'));
      }

      // 2. Check if users are assigned
      const [userCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.role, role.slug));

      const assignedCount = Number(userCountResult?.count ?? 0);
      if (assignedCount > 0) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'ROLE_IN_USE',
            message: `Cannot delete role "${role.name}" because it is currently assigned to ${assignedCount} user${assignedCount > 1 ? 's' : ''}. Please reassign these users to another role before deleting.`,
          },
        });
      }

      await db.delete(roles).where(eq(roles.id, id));

      await recordAudit({
        userId: user.id,
        action: AuditAction.ROLE_DELETED,
        entityType: 'role',
        entityId: id,
        metadata: { deletedRoleName: role.name, deletedSlug: role.slug },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse({ id }, `Role "${role.name}" deleted successfully`));
    }
  );
};
