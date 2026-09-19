import { verifyToken } from '../utils/jwt.js';
import { getDb } from '../database/connection.js';
import { users } from '../database/schema/users.js';
import { eq } from 'drizzle-orm';
import { errorResponse } from '../utils/response.js';
import { UserStatus } from '../config/constants.js';
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
    request.user = user;
    request.tokenPayload = payload;
}
//# sourceMappingURL=auth.js.map