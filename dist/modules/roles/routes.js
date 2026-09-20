import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { getDb } from '../../database/connection.js';
import { roles } from '../../database/schema/roles.js';
import { users } from '../../database/schema/users.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction } from '../../config/constants.js';
import { PERMISSION_REGISTRY, isValidPermission } from '../../config/permissions.js';
import { eq, sql, desc, asc } from 'drizzle-orm';
export const roleRoutes = async (fastify) => {
    fastify.addHook('preHandler', authenticate);
    // 1. GET /api/v1/roles/permissions - Catalog of permissions
    fastify.get('/permissions', async (_req, reply) => {
        return reply.send(successResponse(PERMISSION_REGISTRY, 'Permissions catalog retrieved successfully'));
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
            userCount: sql `count(${users.id})::int`,
        })
            .from(roles)
            .leftJoin(users, eq(users.role, roles.slug))
            .groupBy(roles.id)
            .orderBy(desc(roles.isSystem), asc(roles.name));
        return reply.send(successResponse(allRoles, 'Roles retrieved successfully'));
    });
    // 3. GET /api/v1/roles/:id - Get role details
    fastify.get('/:id', {
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', format: 'uuid' } },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params;
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
            userCount: sql `count(${users.id})::int`,
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
    });
    // 4. POST /api/v1/roles - Create custom role
    fastify.post('/', {
        preHandler: [requirePermission('roles.create')],
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
    }, async (request, reply) => {
        const user = request.user;
        const body = request.body;
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
        for (const p of permissions) {
            if (!isValidPermission(p)) {
                return reply.status(400).send(errorResponse('INVALID_PERMISSION', `Unknown permission identifier: "${p}"`));
            }
        }
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
    });
    // 5. PUT /api/v1/roles/:id - Update role
    fastify.put('/:id', {
        preHandler: [requirePermission('roles.edit')],
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
    }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const body = request.body;
        const db = getDb();
        const [existing] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
        if (!existing) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Role not found'));
        }
        const updateData = {
            updatedAt: new Date(),
        };
        if (body.name !== undefined) {
            updateData.name = body.name.trim();
        }
        if (body.description !== undefined) {
            updateData.description = body.description.trim() || null;
        }
        if (body.permissions !== undefined) {
            for (const p of body.permissions) {
                if (!isValidPermission(p)) {
                    return reply.status(400).send(errorResponse('INVALID_PERMISSION', `Unknown permission identifier: "${p}"`));
                }
            }
            updateData.permissions = body.permissions;
        }
        // Slug can be modified
        if (body.slug !== undefined && body.slug.trim() !== existing.slug) {
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
    });
    // 6. DELETE /api/v1/roles/:id - Delete role
    fastify.delete('/:id', {
        preHandler: [requirePermission('roles.delete')],
        schema: {
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', format: 'uuid' } },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const db = getDb();
        const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
        if (!role) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Role not found'));
        }
        // Check if users are currently assigned to this role
        const [userCountResult] = await db
            .select({ count: sql `count(*)::int` })
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
    });
};
//# sourceMappingURL=routes.js.map