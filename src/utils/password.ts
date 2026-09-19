import argon2 from 'argon2';

/**
 * Hash a plaintext password using Argon2id with production security parameters.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return await argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3,
    parallelism: 1,
  });
}

/**
 * Verify a plaintext password against an Argon2id hash.
 * Timing-safe comparison.
 */
export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}
