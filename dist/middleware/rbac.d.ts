import type { FastifyRequest, FastifyReply } from 'fastify';
import { type UserRoleType } from '../config/constants.js';
/**
 * Require one of the specified roles to access an endpoint.
 */
export declare function requireRoles(...allowedRoles: UserRoleType[]): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * Verify user has permission to report or view a specific site.
 * Admins and Project Managers have global access;
 * Site Engineers and Supervisors must be explicitly assigned.
 */
export declare function verifySiteAccess(userId: string, userRole: string, siteId: string): Promise<boolean>;
