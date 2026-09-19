import type { FastifyRequest, FastifyReply } from 'fastify';
export declare class ReportController {
    static list(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static getById(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static create(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static submit(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static review(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static approve(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static reject(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static stats(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static export(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static todaySummary(request: FastifyRequest, reply: FastifyReply): Promise<never>;
    static update(request: FastifyRequest, reply: FastifyReply): Promise<never>;
}
