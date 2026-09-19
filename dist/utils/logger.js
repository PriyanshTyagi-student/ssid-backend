import pino from 'pino';
import { env } from '../config/env.js';
export const logger = pino({
    level: env.LOG_LEVEL,
    redact: {
        paths: [
            'req.headers.authorization',
            'password',
            'passwordHash',
            'accessToken',
            'refreshToken',
            'token',
            '*.password',
            '*.passwordHash',
            '*.token',
            '*.authorization',
        ],
        censor: '[REDACTED]',
    },
    transport: env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
            },
        }
        : undefined,
});
//# sourceMappingURL=logger.js.map