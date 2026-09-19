import { z } from 'zod';
import { ReportStatus, ReportType } from '../../config/constants.js';
export const createReportEntrySchema = z.object({
    entryData: z.record(z.any()).default({}),
    sortOrder: z.number().int().default(0),
});
export const createReportSectionSchema = z.object({
    sectionType: z.string().min(1, 'Section type is required'),
    sectionName: z.string().min(1, 'Section name is required'),
    sortOrder: z.number().int().default(0),
    entries: z.array(createReportEntrySchema).default([]),
});
export const createReportSchema = z.object({
    reportType: z.enum([ReportType.MATERIAL, ReportType.LABOR, ReportType.MACHINERY], {
        required_error: 'Report type is required (material, labor, machinery)',
    }),
    projectId: z.string({ required_error: 'Project ID is required' }).uuid('Invalid Project ID'),
    siteId: z.string({ required_error: 'Site ID is required' }).uuid('Invalid Site ID'),
    reportDate: z
        .string({ required_error: 'Report date is required (YYYY-MM-DD)' })
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
    sections: z.array(createReportSectionSchema).default([]),
});
export const listReportsQuerySchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    reportType: z.enum([ReportType.MATERIAL, ReportType.LABOR, ReportType.MACHINERY]).optional(),
    projectId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
    status: z
        .enum([
        ReportStatus.DRAFT,
        ReportStatus.SUBMITTED,
        ReportStatus.UNDER_REVIEW,
        ReportStatus.APPROVED,
        ReportStatus.REJECTED,
    ])
        .optional(),
    createdBy: z.string().uuid().optional(),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
//# sourceMappingURL=schema.js.map