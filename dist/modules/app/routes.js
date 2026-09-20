import { successResponse } from '../../utils/response.js';
export const appVersionRoutes = async (fastify) => {
    // GET /api/v1/app/version
    fastify.get('/version', {
        schema: {
            description: 'Get current application version metadata for in-app updates',
            tags: ['App Updates'],
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        message: { type: 'string' },
                        data: {
                            type: 'object',
                            properties: {
                                version: { type: 'string' },
                                versionCode: { type: 'number' },
                                downloadUrl: { type: 'string' },
                                checksum: { type: 'string' },
                                mandatory: { type: 'boolean' },
                                releaseNotes: { type: 'array', items: { type: 'string' } },
                            },
                        },
                    },
                },
            },
        },
    }, async (_request, reply) => {
        // In production this comes from DB or S3/GCS release metadata
        const versionMetadata = {
            version: '1.0.0',
            versionCode: 1,
            downloadUrl: 'https://ptmm.tail05f2a8.ts.net/downloads/app-release.apk',
            checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            mandatory: false,
            releaseNotes: [
                'Full Daily Material Report with auto stock calculation',
                'Full Daily Labor Report with category breakdown & auto totals',
                'Full Daily Machinery Report with equipment utilization & fuel tracking',
                'Offline draft caching and resilient background outbox sync',
                'Report rejection review and resubmission workflow',
            ],
        };
        return reply.send(successResponse(versionMetadata, 'App version metadata retrieved'));
    });
};
//# sourceMappingURL=routes.js.map