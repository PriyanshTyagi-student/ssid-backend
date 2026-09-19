import type { FastifyRequest, FastifyReply } from 'fastify';
import { type TokenPayload } from '../utils/jwt.js';
import { type User } from '../database/schema/users.js';
declare module 'fastify' {
    interface FastifyRequest {
        user?: User;
        tokenPayload?: TokenPayload;
    }
}
export declare function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<undefined>;
