import { z } from 'zod';
export declare const loginSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    phone: z.ZodOptional<z.ZodString>;
    phoneNumber: z.ZodOptional<z.ZodString>;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    phoneNumber?: string | undefined;
    phone?: string | undefined;
}, {
    password: string;
    phoneNumber?: string | undefined;
    phone?: string | undefined;
}>, {
    password: string;
    phoneNumber?: string | undefined;
    phone?: string | undefined;
}, {
    password: string;
    phoneNumber?: string | undefined;
    phone?: string | undefined;
}>, {
    phone: string;
    password: string;
}, {
    password: string;
    phoneNumber?: string | undefined;
    phone?: string | undefined;
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
