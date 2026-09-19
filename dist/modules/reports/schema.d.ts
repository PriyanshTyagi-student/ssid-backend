import { z } from 'zod';
export declare const createReportEntrySchema: z.ZodObject<{
    entryData: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
    sortOrder: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    sortOrder: number;
    entryData: Record<string, any>;
}, {
    sortOrder?: number | undefined;
    entryData?: Record<string, any> | undefined;
}>;
export declare const createReportSectionSchema: z.ZodObject<{
    sectionType: z.ZodString;
    sectionName: z.ZodString;
    sortOrder: z.ZodDefault<z.ZodNumber>;
    entries: z.ZodDefault<z.ZodArray<z.ZodObject<{
        entryData: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
        sortOrder: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        sortOrder: number;
        entryData: Record<string, any>;
    }, {
        sortOrder?: number | undefined;
        entryData?: Record<string, any> | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    entries: {
        sortOrder: number;
        entryData: Record<string, any>;
    }[];
    sectionType: string;
    sectionName: string;
    sortOrder: number;
}, {
    sectionType: string;
    sectionName: string;
    entries?: {
        sortOrder?: number | undefined;
        entryData?: Record<string, any> | undefined;
    }[] | undefined;
    sortOrder?: number | undefined;
}>;
export declare const createReportSchema: z.ZodObject<{
    reportType: z.ZodEnum<["material", "labor", "machinery"]>;
    projectId: z.ZodString;
    siteId: z.ZodString;
    reportDate: z.ZodString;
    sections: z.ZodDefault<z.ZodArray<z.ZodObject<{
        sectionType: z.ZodString;
        sectionName: z.ZodString;
        sortOrder: z.ZodDefault<z.ZodNumber>;
        entries: z.ZodDefault<z.ZodArray<z.ZodObject<{
            entryData: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodAny>>;
            sortOrder: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            sortOrder: number;
            entryData: Record<string, any>;
        }, {
            sortOrder?: number | undefined;
            entryData?: Record<string, any> | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        entries: {
            sortOrder: number;
            entryData: Record<string, any>;
        }[];
        sectionType: string;
        sectionName: string;
        sortOrder: number;
    }, {
        sectionType: string;
        sectionName: string;
        entries?: {
            sortOrder?: number | undefined;
            entryData?: Record<string, any> | undefined;
        }[] | undefined;
        sortOrder?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    projectId: string;
    siteId: string;
    reportType: "material" | "labor" | "machinery";
    reportDate: string;
    sections: {
        entries: {
            sortOrder: number;
            entryData: Record<string, any>;
        }[];
        sectionType: string;
        sectionName: string;
        sortOrder: number;
    }[];
}, {
    projectId: string;
    siteId: string;
    reportType: "material" | "labor" | "machinery";
    reportDate: string;
    sections?: {
        sectionType: string;
        sectionName: string;
        entries?: {
            sortOrder?: number | undefined;
            entryData?: Record<string, any> | undefined;
        }[] | undefined;
        sortOrder?: number | undefined;
    }[] | undefined;
}>;
export type CreateReportInput = z.infer<typeof createReportSchema>;
export declare const listReportsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    reportType: z.ZodOptional<z.ZodEnum<["material", "labor", "machinery"]>>;
    projectId: z.ZodOptional<z.ZodString>;
    siteId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["draft", "submitted", "under_review", "approved", "rejected"]>>;
    createdBy: z.ZodOptional<z.ZodString>;
    dateFrom: z.ZodOptional<z.ZodString>;
    dateTo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "draft" | "submitted" | "under_review" | "approved" | "rejected" | undefined;
    projectId?: string | undefined;
    siteId?: string | undefined;
    reportType?: "material" | "labor" | "machinery" | undefined;
    createdBy?: string | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}, {
    status?: "draft" | "submitted" | "under_review" | "approved" | "rejected" | undefined;
    projectId?: string | undefined;
    siteId?: string | undefined;
    reportType?: "material" | "labor" | "machinery" | undefined;
    createdBy?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    dateFrom?: string | undefined;
    dateTo?: string | undefined;
}>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
