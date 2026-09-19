import type { UserRoleType } from '../config/constants.js';
export interface TokenPayload {
    userId: string;
    phone: string;
    role: UserRoleType;
    name: string;
}
export declare function generateToken(payload: TokenPayload): string;
export declare function verifyToken(token: string): TokenPayload | null;
