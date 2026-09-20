export declare const env: {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    HOST: string;
    DATABASE_URL: string;
    DATABASE_DIR: string;
    JWT_SECRET: string;
    JWT_EXPIRES_IN: string;
    CORS_ORIGIN: string;
    RATE_LIMIT_MAX: number;
    RATE_LIMIT_AUTH_MAX: number;
    RATE_LIMIT_WINDOW_MS: number;
    LOG_LEVEL: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
    APK_STORAGE_DIR: string;
    ANDROID_PACKAGE_NAME: string;
    MAX_APK_SIZE_MB: number;
    TAILSCALE_URL: string;
};
