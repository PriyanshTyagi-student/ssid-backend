/**
 * Hash a plaintext password using Argon2id with production security parameters.
 */
export declare function hashPassword(plaintext: string): Promise<string>;
/**
 * Verify a plaintext password against an Argon2id hash.
 * Timing-safe comparison.
 */
export declare function verifyPassword(hash: string, plaintext: string): Promise<boolean>;
