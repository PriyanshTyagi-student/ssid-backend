import { FastifyPluginAsync } from 'fastify';
export declare const PERMISSION_CATALOG: {
    module: string;
    description: string;
    permissions: {
        id: string;
        label: string;
        description: string;
    }[];
}[];
export declare const roleRoutes: FastifyPluginAsync;
