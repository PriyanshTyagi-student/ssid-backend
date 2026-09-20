import { verifyToken } from '../utils/jwt.js';
import { getDb } from '../database/connection.js';
import { users } from '../database/schema/users.js';
import { roles } from '../database/schema/roles.js';
import { eq } from 'drizzle-orm';
import { errorResponse } from '../utils/response.js';
import { UserRole, UserStatus } from '../config/constants.js';
export async function authenticate(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Authorization token required. Format: Bearer <token>'));
    }
    const token = authHeader.substring(7).trim();
    const payload = verifyToken(token);
    if (!payload) {
        return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Invalid or expired token.'));
    }
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user) {
        return reply.status(401).send(errorResponse('UNAUTHORIZED', 'User not found.'));
    }
    if (user.status !== UserStatus.ACTIVE) {
        return reply.status(403).send(errorResponse('USER_DISABLED', 'Your account has been disabled. Please contact an administrator.'));
    }
    // Resolve user's permissions dynamically from roles table
    let permissions = [];
    try {
        const [roleRecord] = await db
            .select({ permissions: roles.permissions })
            .from(roles)
            .where(eq(roles.slug, user.role))
            .limit(1);
        if (roleRecord && Array.isArray(roleRecord.permissions)) {
            permissions = roleRecord.permissions;
        }
    }
    catch {
        // Fallback
    }
    if (user.role === UserRole.ADMIN || user.role === 'admin') {
        if (!permissions.includes('*')) {
            permissions = ['*', ...permissions];
        }
    }
    request.user = {
        ...user,
        permissions,
    };
    request.tokenPayload = payload;
}
//# sourceMappingURL=auth.js.map