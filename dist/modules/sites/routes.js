import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { getDb } from '../../database/connection.js';
import { sites } from '../../database/schema/sites.js';
import { projects } from '../../database/schema/projects.js';
import { userSiteAssignments } from '../../database/schema/assignments.js';
import { eq, inArray, count, and } from 'drizzle-orm';
import { successResponse, errorResponse } from '../../utils/response.js';
import { UserRole } from '../../config/constants.js';
const siteListQuerySchema = z.object({
    projectId: z.string().uuid().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});
export const siteRoutes = async (fastify) => {
    fastify.addHook('preHandler', authenticate);
    // GET /api/v1/sites
    fastify.get('/', {
        schema: {
            description: 'List construction sites (scoped to user assignments)',
            tags: ['Sites'],
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    projectId: { type: 'string', format: 'uuid' },
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 },
                },
            },
        },
    }, async (request, reply) => {
        const query = siteListQuerySchema.parse(request.query);
        const db = getDb();
        const user = request.user;
        const offset = (query.page - 1) * query.limit;
        let siteList;
        let totalSites = 0;
        if (user.role === UserRole.ADMIN || user.role === UserRole.PROJECT_MANAGER) {
            const whereClause = query.projectId ? eq(sites.projectId, query.projectId) : undefined;
            const [totalRes] = await db
                .select({ count: count() })
                .from(sites)
                .where(whereClause);
            totalSites = Number(totalRes.count);
            siteList = await db
                .select({
                id: sites.id,
                name: sites.name,
                projectId: sites.projectId,
                projectName: projects.name,
                location: sites.location,
                description: sites.description,
                status: sites.status,
                createdAt: sites.createdAt,
            })
                .from(sites)
                .innerJoin(projects, eq(sites.projectId, projects.id))
                .where(whereClause)
                .limit(query.limit)
                .offset(offset)
                .orderBy(sites.createdAt);
        }
        else {
            // Scoped to assigned sites
            const assignments = await db
                .select({ siteId: userSiteAssignments.siteId })
                .from(userSiteAssignments)
                .where(eq(userSiteAssignments.userId, user.id));
            const siteIds = assignments.map((a) => a.siteId);
            if (siteIds.length === 0) {
                return reply.send(successResponse([], 'No sites assigned', {
                    page: query.page,
                    limit: query.limit,
                    total: 0,
                    totalPages: 0,
                }));
            }
            const conditions = [inArray(sites.id, siteIds)];
            if (query.projectId) {
                conditions.push(eq(sites.projectId, query.projectId));
            }
            const combinedWhere = and(...conditions);
            const [totalRes] = await db
                .select({ count: count() })
                .from(sites)
                .where(combinedWhere);
            totalSites = Number(totalRes.count);
            siteList = await db
                .select({
                id: sites.id,
                name: sites.name,
                projectId: sites.projectId,
                projectName: projects.name,
                location: sites.location,
                description: sites.description,
                status: sites.status,
                createdAt: sites.createdAt,
            })
                .from(sites)
                .innerJoin(projects, eq(sites.projectId, projects.id))
                .where(combinedWhere)
                .limit(query.limit)
                .offset(offset)
                .orderBy(sites.createdAt);
        }
        return reply.send(successResponse(siteList, 'Sites retrieved successfully', {
            page: query.page,
            limit: query.limit,
            total: totalSites,
            totalPages: Math.ceil(totalSites / query.limit),
        }));
    });
    // GET /api/v1/sites/:id
    fastify.get('/:id', {
        schema: {
            description: 'Get site detail by ID',
            tags: ['Sites'],
            security: [{ bearerAuth: [] }],
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const db = getDb();
        const user = request.user;
        // Verify assignment access for site engineers
        if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
            const [assignment] = await db
                .select()
                .from(userSiteAssignments)
                .where(and(eq(userSiteAssignments.userId, user.id), eq(userSiteAssignments.siteId, id)))
                .limit(1);
            if (!assignment) {
                return reply.status(403).send(errorResponse('FORBIDDEN', 'You are not assigned to this site'));
            }
        }
        const [site] = await db
            .select({
            id: sites.id,
            name: sites.name,
            projectId: sites.projectId,
            projectName: projects.name,
            location: sites.location,
            description: sites.description,
            status: sites.status,
            createdAt: sites.createdAt,
        })
            .from(sites)
            .innerJoin(projects, eq(sites.projectId, projects.id))
            .where(eq(sites.id, id))
            .limit(1);
        if (!site) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Site not found'));
        }
        return reply.send(successResponse(site, 'Site retrieved successfully'));
    });
    // POST /api/v1/sites
    fastify.post('/', {
        schema: {
            description: 'Create a new construction site',
            tags: ['Sites'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['name', 'projectId'],
                properties: {
                    name: { type: 'string', minLength: 2 },
                    projectId: { type: 'string', format: 'uuid' },
                    location: { type: 'string' },
                    description: { type: 'string' },
                    status: { type: 'string', enum: ['active', 'inactive', 'completed'] },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
            return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions to create sites'));
        }
        const body = request.body;
        const db = getDb();
        // Verify project exists
        const [project] = await db.select().from(projects).where(eq(projects.id, body.projectId)).limit(1);
        if (!project) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Target project does not exist'));
        }
        const [newSite] = await db
            .insert(sites)
            .values({
            name: body.name,
            projectId: body.projectId,
            location: body.location || null,
            description: body.description || null,
            status: body.status || 'active',
        })
            .returning();
        return reply.status(201).send(successResponse(newSite, 'Site created successfully'));
    });
    // PATCH /api/v1/sites/:id
    fastify.patch('/:id', {
        schema: {
            description: 'Update site details',
            tags: ['Sites'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                properties: {
                    name: { type: 'string', minLength: 2 },
                    location: { type: 'string' },
                    description: { type: 'string' },
                    status: { type: 'string', enum: ['active', 'inactive', 'completed'] },
                },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params;
        const user = request.user;
        if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
            return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions to modify sites'));
        }
        const body = request.body;
        const db = getDb();
        const [existing] = await db.select().from(sites).where(eq(sites.id, id)).limit(1);
        if (!existing) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Site not found'));
        }
        const [updated] = await db
            .update(sites)
            .set({
            ...body,
            updatedAt: new Date(),
        })
            .where(eq(sites.id, id))
            .returning();
        return reply.send(successResponse(updated, 'Site updated successfully'));
    });
};
//# sourceMappingURL=routes.js.map