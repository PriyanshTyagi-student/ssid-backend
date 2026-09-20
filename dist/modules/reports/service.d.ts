import type { CreateReportInput, ListReportsQuery } from './schema.js';
export declare class ReportService {
    /**
     * List reports with comprehensive filtering, pagination, and role-based scoping.
     */
    static listReports(query: ListReportsQuery, user: any): Promise<{
        reports: any;
        meta: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    /**
     * Get single report by ID including all sections and entries.
     */
    static getReportById(id: string, user: any): Promise<any>;
    /**
     * Create report with sections and entries inside a database transaction.
     */
    static createReport(input: CreateReportInput, user: any, ipAddress?: string, userAgent?: string): Promise<any>;
    /**
     * Submit report — enforces state transition to SUBMITTED.
     */
    static submitReport(reportId: string, user: any, ipAddress?: string, userAgent?: string): Promise<any>;
    /**
     * Start review of report (SUBMITTED -> UNDER_REVIEW).
     */
    static reviewReport(reportId: string, reviewerId: string, ipAddress?: string, userAgent?: string): Promise<any>;
    /**
     * Approve report (SUBMITTED or UNDER_REVIEW -> APPROVED).
     */
    static approveReport(reportId: string, reviewerId: string, ipAddress?: string, userAgent?: string): Promise<any>;
    /**
     * Reject report with mandatory reason (SUBMITTED or UNDER_REVIEW -> REJECTED).
     */
    static rejectReport(reportId: string, reviewerId: string, rejectionReason: string, ipAddress?: string, userAgent?: string): Promise<any>;
    /**
     * Aggregated Dashboard Statistics.
     */
    static getDashboardStats(user: any): Promise<{
        todayDate: string;
        reportsToday: {
            material: number;
            labor: number;
            machinery: number;
            total: number;
        };
        reportStatus: {
            submitted: number;
            underReview: number;
            approved: number;
            rejected: number;
        };
        counts: {
            activeProjects: number;
            activeSites: number;
            activeUsers: number;
        };
        recentReports: any;
    }>;
    /**
     * Export reports as CSV data.
     */
    static exportReports(query: ListReportsQuery, user: any, ipAddress?: string, userAgent?: string): Promise<{
        csv: string;
        csvData: string;
        filename: string;
        totalRecords: any;
    }>;
    /**
     * Get submission status for today's reports for the current user.
     */
    static getTodaySummary(userId: string): Promise<Record<string, any>>;
    /**
     * Update report sections/entries if in DRAFT or REJECTED status.
     */
    static updateReport(reportId: string, input: any, user: any, ipAddress?: string, userAgent?: string): Promise<any>;
    static deleteReport(reportId: string, user: any, ipAddress?: string, userAgent?: string): Promise<{
        id: string;
        deleted: boolean;
    }>;
}
