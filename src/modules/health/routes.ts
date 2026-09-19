import type { FastifyPluginAsync } from 'fastify';
import { isDbConnected } from '../../database/connection.js';
import { successResponse } from '../../utils/response.js';
import { env } from '../../config/env.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/health',
    {
      schema: {
        description: 'System health check and database connectivity monitor',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  database: { type: 'string' },
                  environment: { type: 'string' },
                  uptime: { type: 'number' },
                  timestamp: { type: 'string' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  database: { type: 'string' },
                  environment: { type: 'string' },
                  uptime: { type: 'number' },
                  timestamp: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const dbStatus = isDbConnected() ? 'connected' : 'disconnected';
      const isHealthy = isDbConnected();

      const data = {
        status: isHealthy ? 'healthy' : 'degraded',
        database: dbStatus,
        environment: env.NODE_ENV,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };

      if (!isHealthy) {
        return reply.status(503).send(successResponse(data, 'Service degraded: Database disconnected'));
      }

      return reply.send(successResponse(data, 'System operational'));
    }
  );
};
