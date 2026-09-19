import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
export function generateToken(payload) {
    return jwt.sign(payload, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    });
}
export function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, env.JWT_SECRET);
        return decoded;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=jwt.js.map