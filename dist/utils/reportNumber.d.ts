import { type ReportTypeType } from '../config/constants.js';
/**
 * Generate a standard server-side report number.
 * Example: MR-20260918-0001, LR-20260918-0002, MCR-20260918-0003
 */
export declare function generateReportNumber(type: ReportTypeType, date: Date, sequenceNumber: number): string;
