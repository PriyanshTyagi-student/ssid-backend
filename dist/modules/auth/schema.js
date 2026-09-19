import { z } from 'zod';
import { isValidIndianPhone, normalizePhoneNumber } from '../../utils/phone.js';
export const loginSchema = z.object({
    phone: z
        .string({ required_error: 'Phone number is required' })
        .refine((val) => isValidIndianPhone(val), {
        message: 'Invalid phone number. Must be a 10-digit Indian phone number (e.g. 9876543210 or +919876543210)',
    })
        .transform((val) => normalizePhoneNumber(val)),
    password: z
        .string({ required_error: 'Password is required' })
        .min(6, 'Password must be at least 6 characters'),
});
export const forgotPasswordSchema = z.object({
    phone: z
        .string({ required_error: 'Phone number is required' })
        .refine((val) => isValidIndianPhone(val), {
        message: 'Invalid phone number. Must be a 10-digit Indian phone number',
    })
        .transform((val) => normalizePhoneNumber(val)),
});
export const changePasswordSchema = z.object({
    currentPassword: z.string({ required_error: 'Current password is required' }).min(6),
    newPassword: z
        .string({ required_error: 'New password is required' })
        .min(8, 'New password must be at least 8 characters')
        .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'New password must contain at least one number'),
});
//# sourceMappingURL=schema.js.map