import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { UserRoleType } from '../config/constants.js';

export interface TokenPayload {
  userId: string;
  phone: string;
  role: UserRoleType;
  name: string;
}

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as any,
  });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}
