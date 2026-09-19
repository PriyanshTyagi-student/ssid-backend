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

export function normalizePhoneNumber(rawPhone: string): string | null {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  // Remove whitespace, dashes, brackets, dots
  let cleaned = rawPhone.replace(/[\s\-().]/g, '');

  // Strip leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Strip leading 0
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.slice(1);
  }

  // If starts with 91 and is 12 digits
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    const tenDigits = cleaned.slice(2);
    if (/^[6-9]\d{9}$/.test(tenDigits)) {
      return `+91${tenDigits}`;
    }
  }

  // If 10 digits starting with 6-9
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }

  return null;
}

export function isValidIndianPhone(phone: string): boolean {
  return normalizePhoneNumber(phone) !== null;
}
