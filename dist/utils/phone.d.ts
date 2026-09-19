/**
 * Centralized Indian phone number normalization and validation.
 *
 * Supports input formats:
 * - 9876543210
 * - +919876543210
 * - +91 9876543210
 * - 09876543210
 * - 91-9876543210
 *
 * Normalizes all valid formats to canonical: +919876543210
 */
export declare function normalizePhoneNumber(rawPhone: string): string | null;
export declare function isValidIndianPhone(phone: string): boolean;
