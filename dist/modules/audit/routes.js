import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { getDb } from '../../database/connection.js';
import { auditLogs } from '../../database/schema/audit.js';
import { desc, count } from 'drizzle-orm';
import { successResponse } from '../../utils/response.js';
const auditQuerySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});
export const auditRoutes = async (fastify) => {
    fastify.addHook('preHandler', authenticate);
    fastify.addHook('preHandler', requirePermission('audit.view', 'settings.view'));
    fastify.get('/', {
        schema: {
            description: 'Query audit logs (Admin only)',
            tags: ['Audit'],
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 },
                },
            },
        },
    }, async (request, reply) => {
        const query = auditQuerySchema.parse(request.query);
        const db = getDb();
        const offset = (query.page - 1) * query.limit;
        const [totalRes] = await db.select({ count: count() }).from(auditLogs);
        const total = Number(totalRes.count);
        const logs = await db
            .select()
            .from(auditLogs)
            .limit(query.limit)
            .offset(offset)
            .orderBy(desc(auditLogs.createdAt));
        return reply.send(successResponse(logs, 'Audit logs retrieved successfully', {
            page: query.page,
            limit: query.limit,
            total,
            totalPages: Math.ceil(total / query.limit),
        }));
    });
};
//# sourceMappingURL=routes.js.map