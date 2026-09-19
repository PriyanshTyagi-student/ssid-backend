import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { errorResponse } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  // 1. Zod Validation Errors
  if (error instanceof ZodError) {
    const details = error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return reply.status(400).send(errorResponse('VALIDATION_ERROR', 'Invalid request data', details));
  }

  // 2. Fastify Validation Errors
  if (error.validation) {
    const details = error.validation.map((v) => ({
      field: v.instancePath || v.params?.missingProperty || '',
      message: v.message || 'Invalid value',
    }));
    return reply.status(400).send(errorResponse('VALIDATION_ERROR', error.message, details));
  }

  // 3. Rate Limit Error
  if (error.statusCode === 429) {
    return reply.status(429).send(errorResponse('TOO_MANY_REQUESTS', 'Rate limit exceeded. Please try again later.'));
  }

  const statusCode = error.statusCode || 500;
  const isClientError = statusCode >= 400 && statusCode < 500;

  if (!isClientError) {
    logger.error(
      {
        reqId: request.id,
        method: request.method,
        url: request.url,
        err: error,
      },
      '[SERVER ERROR] Unhandled server error'
    );
  }

  const message =
    isClientError || env.NODE_ENV !== 'production'
      ? error.message || 'Internal Server Error'
      : 'An unexpected internal error occurred';

  const code = error.code || (statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_SERVER_ERROR');

  return reply.status(statusCode).send(errorResponse(code, message));
}
