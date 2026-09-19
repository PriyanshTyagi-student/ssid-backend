import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
// Route modules
import { healthRoutes } from './modules/health/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { siteRoutes } from './modules/sites/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { auditRoutes } from './modules/audit/routes.js';
import { appVersionRoutes } from './modules/app/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { laborCategoryRoutes } from './modules/labor-categories/routes.js';
import { assignmentRoutes } from './modules/assignments/routes.js';
export async function buildApp() {
    const app = Fastify({
        loggerInstance: logger,
        disableRequestLogging: false,
        bodyLimit: 10 * 1024 * 1024, // 10MB limit
    });
    // 1. Security Headers
    await app.register(helmet, {
        contentSecurityPolicy: false, // Allows Swagger UI
    });
    // Support empty JSON request bodies gracefully without throwing FST_ERR_CTP_EMPTY_JSON_BODY
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
        if (!body || body.trim() === '') {
            done(null, {});
            return;
        }
        try {
            const json = JSON.parse(body);
            done(null, json);
        }
        catch (err) {
            done(err, undefined);
        }
    });
    // 2. CORS
    await app.register(cors, {
        origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: true,
    });
    // 3. Global Rate Limiting
    await app.register(rateLimit, {
        max: env.RATE_LIMIT_MAX,
        timeWindow: env.RATE_LIMIT_WINDOW_MS,
    });
    // 4. OpenAPI / Swagger Documentation
    await app.register(swagger, {
        openapi: {
            info: {
                title: 'Construction Daily Reporting API',
                description: 'Production API service for Mobile Application and Admin Web Dashboard',
                version: '1.0.0',
            },
            servers: [
                {
                    url: `http://${env.HOST}:${env.PORT}`,
                    description: 'Current Environment Server',
                },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                        description: 'Enter your JWT access token as: Bearer <token>',
                    },
                },
            },
        },
    });
    await app.register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: true,
        },
    });
    // 5. Central Error Handler
    app.setErrorHandler(errorHandler);
    // 6. Register API routes under /api/v1
    await app.register(async (v1) => {
        await v1.register(healthRoutes);
        await v1.register(authRoutes, { prefix: '/auth' });
        await v1.register(userRoutes, { prefix: '/users' });
        await v1.register(userRoutes, { prefix: '/user' });
        await v1.register(projectRoutes, { prefix: '/projects' });
        await v1.register(siteRoutes, { prefix: '/sites' });
        await v1.register(reportRoutes, { prefix: '/reports' });
        await v1.register(auditRoutes, { prefix: '/audit' });
        await v1.register(appVersionRoutes, { prefix: '/app' });
        await v1.register(notificationRoutes, { prefix: '/notifications' });
        await v1.register(laborCategoryRoutes, { prefix: '/labor-categories' });
        await v1.register(assignmentRoutes, { prefix: '/assignments' });
    }, { prefix: '/api/v1' });
    // Root health redirect
    app.get('/health', async (req, reply) => {
        return reply.redirect('/api/v1/health');
    });
    return app;
}
//# sourceMappingURL=app.js.map