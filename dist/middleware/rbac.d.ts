import type { FastifyRequest, FastifyReply } from 'fastify';
import { type UserRoleType } from '../config/constants.js';
/**
 * Require one or more permissions to access an endpoint.
 * Satisfied if user has ANY of the specified permissions (OR logic).
 */
export declare function requirePermission(...permissions: string[]): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * Require ALL of the specified permissions to access an endpoint (AND logic).
 */
export declare function requireAllPermissions(...permissions: string[]): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * Legacy role check helper (kept for backwards compatibility or explicit role requirements)
 */
export declare function requireRoles(...allowedRoles: (UserRoleType | string)[]): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * Verify user has permission to report or view a specific site.
 * Project/site scope ("Where can I do it?") is separate from RBAC ("What can I do?").
 * Admins or users with global site management have global access;
 * other users must be assigned in user_site_assignments.
 */
export declare function verifySiteAccess(userId: string, userRole: string, siteId: string, userPermissions?: string[]): Promise<boolean>;
