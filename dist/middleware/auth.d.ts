import type { FastifyRequest, FastifyReply } from 'fastify';
import { type TokenPayload } from '../utils/jwt.js';
import { type User } from '../database/schema/users.js';
export interface AuthenticatedUser extends User {
    permissions: string[];
}
declare module 'fastify' {
    interface FastifyRequest {
        user?: AuthenticatedUser;
        tokenPayload?: TokenPayload;
    }
}
export declare function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<undefined>;
