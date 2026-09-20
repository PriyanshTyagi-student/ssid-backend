import { AuthController } from './controller.js';
import { authenticate } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
export const authRoutes = async (fastify) => {
    // Check if first-run administrator setup is required
    fastify.get('/setup-status', {
        schema: {
            description: 'Check if first-run administrator bootstrap is required',
            tags: ['Authentication'],
        },
    }, AuthController.setupStatus);
    // Bootstrap initial administrator account (only allowed when 0 users exist)
    fastify.post('/bootstrap', {
        schema: {
            description: 'First-run bootstrap: create initial administrator account',
            tags: ['Authentication'],
            body: {
                type: 'object',
                required: ['name', 'password'],
                properties: {
                    name: { type: 'string', minLength: 2 },
                    phone: { type: 'string' },
                    phoneNumber: { type: 'string' },
                    password: { type: 'string', minLength: 6 },
                },
            },
        },
    }, AuthController.bootstrap);
    // Rate-limited login endpoint
    fastify.post('/login', {
        config: {
            rateLimit: {
                max: env.RATE_LIMIT_AUTH_MAX,
                timeWindow: env.RATE_LIMIT_WINDOW_MS,
            },
        },
        schema: {
            description: 'User login with Indian phone number and password',
            tags: ['Authentication'],
            body: {
                type: 'object',
                required: ['password'],
                properties: {
                    phone: { type: 'string', description: '10-digit phone, with +91 prefix, or username' },
                    phoneNumber: { type: 'string', description: 'Alternative phone field name' },
                    password: { type: 'string', minLength: 6 },
                },
            },
        },
    }, AuthController.login);
    // Logout endpoint
    fastify.post('/logout', {
        preHandler: [authenticate],
        schema: {
            description: 'User logout and session revocation',
            tags: ['Authentication'],
            security: [{ bearerAuth: [] }],
        },
    }, AuthController.logout);
    // Me endpoint
    fastify.get('/me', {
        preHandler: [authenticate],
        schema: {
            description: 'Get current user session profile',
            tags: ['Authentication'],
            security: [{ bearerAuth: [] }],
        },
    }, AuthController.me);
    // Rate-limited forgot password endpoint
    fastify.post('/forgot-password', {
        config: {
            rateLimit: {
                max: env.RATE_LIMIT_AUTH_MAX,
                timeWindow: env.RATE_LIMIT_WINDOW_MS,
            },
        },
        schema: {
            description: 'Request password reset instructions',
            tags: ['Authentication'],
            body: {
                type: 'object',
                required: ['phone'],
                properties: {
                    phone: { type: 'string' },
                },
            },
        },
    }, AuthController.forgotPassword);
    // Change password endpoint
    fastify.post('/change-password', {
        preHandler: [authenticate],
        schema: {
            description: 'Change user password',
            tags: ['Authentication'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                    currentPassword: { type: 'string', minLength: 6 },
                    newPassword: { type: 'string', minLength: 8 },
                },
            },
        },
    }, AuthController.changePassword);
};
//# sourceMappingURL=routes.js.map