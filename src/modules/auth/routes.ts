import type { FastifyPluginAsync } from 'fastify';
import { AuthController } from './controller.js';
import { authenticate } from '../../middleware/auth.js';
import { env } from '../../config/env.js';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Rate-limited login endpoint
  fastify.post(
    '/login',
    {
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
          required: ['phone', 'password'],
          properties: {
            phone: { type: 'string', description: '10-digit phone or with +91 prefix' },
            password: { type: 'string', minLength: 6 },
          },
        },
      },
    },
    AuthController.login
  );

  // Logout endpoint
  fastify.post(
    '/logout',
    {
      preHandler: [authenticate],
      schema: {
        description: 'User logout and session revocation',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
    },
    AuthController.logout
  );

  // Me endpoint
  fastify.get(
    '/me',
    {
      preHandler: [authenticate],
      schema: {
        description: 'Get current user session profile',
        tags: ['Authentication'],
        security: [{ bearerAuth: [] }],
      },
    },
    AuthController.me
  );

  // Rate-limited forgot password endpoint
  fastify.post(
    '/forgot-password',
    {
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
    },
    AuthController.forgotPassword
  );

  // Change password endpoint
  fastify.post(
    '/change-password',
    {
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
    },
    AuthController.changePassword
  );
};
