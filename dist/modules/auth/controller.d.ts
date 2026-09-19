import type { FastifyRequest, FastifyReply } from 'fastify';
export declare class AuthController {
    static login(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static logout(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static me(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static forgotPassword(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static changePassword(request: FastifyRequest, reply: FastifyReply): Promise<never>;
}
