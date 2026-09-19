import { ReportType, type ReportTypeType } from '../config/constants.js';

/**
 * Generate a standard server-side report number.
 * Example: MR-20260918-0001, LR-20260918-0002, MCR-20260918-0003
 */
export function generateReportNumber(type: ReportTypeType, date: Date, sequenceNumber: number): string {
  const prefixMap: Record<ReportTypeType, string> = {
    [ReportType.MATERIAL]: 'MR',
    [ReportType.LABOR]: 'LR',
    [ReportType.MACHINERY]: 'MCR',
  };

  const prefix = prefixMap[type] || 'REP';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const seq = String(sequenceNumber).padStart(4, '0');

  return `${prefix}-${yyyy}${mm}${dd}-${seq}`;
}
