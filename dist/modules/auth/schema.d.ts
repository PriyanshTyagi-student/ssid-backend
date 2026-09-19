import { z } from 'zod';
export declare const loginSchema: z.ZodObject<{
    phone: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    phone: string;
}, {
    password: string;
    phone: string;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const forgotPasswordSchema: z.ZodObject<{
    phone: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string, string>;
}, "strip", z.ZodTypeAny, {
    phone: string;
}, {
    phone: string;
}>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export declare const changePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
