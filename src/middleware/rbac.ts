import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole, type UserRoleType } from '../config/constants.js';
import { errorResponse } from '../utils/response.js';
import { getDb } from '../database/connection.js';
import { userSiteAssignments } from '../database/schema/assignments.js';
import { and, eq } from 'drizzle-orm';

/**
 * Require one of the specified roles to access an endpoint.
 */
export function requireRoles(...allowedRoles: UserRoleType[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Authentication required'));
    }

    if (!allowedRoles.includes(request.user.role as UserRoleType)) {
      return reply
        .status(403)
        .send(errorResponse('FORBIDDEN', `Access forbidden. Required role: ${allowedRoles.join(' or ')}`));
    }
  };
}

/**
 * Verify user has permission to report or view a specific site.
 * Admins and Project Managers have global access;
 * Site Engineers and Supervisors must be explicitly assigned.
 */
export async function verifySiteAccess(userId: string, userRole: string, siteId: string): Promise<boolean> {
  if (userRole === UserRole.ADMIN || userRole === UserRole.PROJECT_MANAGER) {
    return true;
  }

  const db = getDb();
  const [assignment] = await db
    .select()
    .from(userSiteAssignments)
    .where(and(eq(userSiteAssignments.userId, userId), eq(userSiteAssignments.siteId, siteId)))
    .limit(1);

  return !!assignment;
}
