import type { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole, type UserRoleType } from '../config/constants.js';
import { errorResponse } from '../utils/response.js';
import { getDb } from '../database/connection.js';
import { userSiteAssignments } from '../database/schema/assignments.js';
import { hasPermission, hasAnyPermission } from '../config/permissions.js';
import { and, eq } from 'drizzle-orm';

/**
 * Require one or more permissions to access an endpoint.
 * Satisfied if user has ANY of the specified permissions (OR logic).
 */
export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Authentication required'));
    }

    // Administrators and wildcard roles bypass permission checks
    if (request.user.role === UserRole.ADMIN || request.user.role === 'admin' || (request.user.permissions || []).includes('*')) {
      return;
    }

    const userPermissions = request.user.permissions || [];
    if (!hasAnyPermission(userPermissions, permissions)) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', `Access forbidden. Required permission: ${permissions.join(' or ')}`)
      );
    }
  };
}

/**
 * Require ALL of the specified permissions to access an endpoint (AND logic).
 */
export function requireAllPermissions(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Authentication required'));
    }

    // Administrators and wildcard roles bypass permission checks
    if (request.user.role === UserRole.ADMIN || request.user.role === 'admin' || (request.user.permissions || []).includes('*')) {
      return;
    }

    const userPermissions = request.user.permissions || [];
    const missing = permissions.filter((p) => !hasPermission(userPermissions, p));
    if (missing.length > 0) {
      return reply.status(403).send(
        errorResponse('FORBIDDEN', `Access forbidden. Missing required permissions: ${missing.join(', ')}`)
      );
    }
  };
}

/**
 * Legacy role check helper (kept for backwards compatibility or explicit role requirements)
 */
export function requireRoles(...allowedRoles: (UserRoleType | string)[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Authentication required'));
    }

    // Administrators and wildcard roles bypass explicit role checks
    if (request.user.role === UserRole.ADMIN || (request.user.permissions || []).includes('*')) {
      return;
    }

    if (!allowedRoles.includes(request.user.role as any)) {
      return reply
        .status(403)
        .send(errorResponse('FORBIDDEN', `Access forbidden. Required role: ${allowedRoles.join(' or ')}`));
    }
  };
}

/**
 * Verify user has permission to report or view a specific site.
 * Project/site scope ("Where can I do it?") is separate from RBAC ("What can I do?").
 * Admins or users with global site management have global access;
 * other users must be assigned in user_site_assignments.
 */
export async function verifySiteAccess(
  userId: string,
  userRole: string,
  siteId: string,
  userPermissions: string[] = []
): Promise<boolean> {
  if (
    userRole === UserRole.ADMIN ||
    userPermissions.includes('*') ||
    hasPermission(userPermissions, 'sites.manage')
  ) {
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
