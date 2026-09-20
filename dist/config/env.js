import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().optional().default(''),
    DATABASE_DIR: z.string().default('./data/pgdata'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters').default('super-secure-production-jwt-secret-key-change-in-prod-min-32-chars'),
    JWT_EXPIRES_IN: z.string().default('7d'),
    CORS_ORIGIN: z.string().default('*'),
    RATE_LIMIT_MAX: z.coerce.number().default(100),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().default(10),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    APK_STORAGE_DIR: z.string().default('./data/apks'),
    ANDROID_PACKAGE_NAME: z.string().default('com.ssid.ssid_app'),
    MAX_APK_SIZE_MB: z.coerce.number().default(200),
    TAILSCALE_URL: z.string().default('https://ptmm.tail05f2a8.ts.net'),
});
const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
    console.error('❌ Invalid environment variables:', parsedEnv.error.format());
    process.exit(1);
}
export const env = parsedEnv.data;
//# sourceMappingURL=env.js.map