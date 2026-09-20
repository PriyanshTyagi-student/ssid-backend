export declare const UserRole: {
    readonly ADMIN: "admin";
    readonly PROJECT_MANAGER: "project_manager";
    readonly SITE_ENGINEER: "site_engineer";
    readonly SITE_SUPERVISOR: "site_supervisor";
};
export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];
export declare const UserStatus: {
    readonly ACTIVE: "active";
    readonly DISABLED: "disabled";
};
export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];
export declare const ProjectStatus: {
    readonly ACTIVE: "active";
    readonly COMPLETED: "completed";
    readonly ARCHIVED: "archived";
};
export type ProjectStatusType = (typeof ProjectStatus)[keyof typeof ProjectStatus];
export declare const SiteStatus: {
    readonly ACTIVE: "active";
    readonly COMPLETED: "completed";
    readonly ARCHIVED: "archived";
};
export type SiteStatusType = (typeof SiteStatus)[keyof typeof SiteStatus];
export declare const ReportType: {
    readonly MATERIAL: "material";
    readonly LABOR: "labor";
    readonly MACHINERY: "machinery";
};
export type ReportTypeType = (typeof ReportType)[keyof typeof ReportType];
export declare const ReportStatus: {
    readonly DRAFT: "draft";
    readonly SUBMITTED: "submitted";
    readonly UNDER_REVIEW: "under_review";
    readonly APPROVED: "approved";
    readonly REJECTED: "rejected";
};
export type ReportStatusType = (typeof ReportStatus)[keyof typeof ReportStatus];
export declare const LaborCategoryType: {
    readonly SKILLED: "skilled";
    readonly UNSKILLED: "unskilled";
    readonly SUPERVISORY: "supervisory";
};
export type LaborCategoryTypeValue = (typeof LaborCategoryType)[keyof typeof LaborCategoryType];
export declare const AuditAction: {
    readonly USER_LOGIN: "USER_LOGIN";
    readonly USER_LOGIN_FAILED: "USER_LOGIN_FAILED";
    readonly USER_LOGOUT: "USER_LOGOUT";
    readonly USER_CREATED: "USER_CREATED";
    readonly USER_UPDATED: "USER_UPDATED";
    readonly USER_DISABLED: "USER_DISABLED";
    readonly PASSWORD_CHANGED: "PASSWORD_CHANGED";
    readonly REPORT_CREATED: "REPORT_CREATED";
    readonly REPORT_UPDATED: "REPORT_UPDATED";
    readonly REPORT_SUBMITTED: "REPORT_SUBMITTED";
    readonly REPORT_REJECTED: "REPORT_REJECTED";
    readonly REPORT_APPROVED: "REPORT_APPROVED";
    readonly PROJECT_CREATED: "PROJECT_CREATED";
    readonly PROJECT_UPDATED: "PROJECT_UPDATED";
    readonly PROJECT_DELETED: "PROJECT_DELETED";
    readonly SITE_CREATED: "SITE_CREATED";
    readonly SITE_UPDATED: "SITE_UPDATED";
    readonly SITE_DELETED: "SITE_DELETED";
    readonly USER_DELETED: "USER_DELETED";
    readonly REPORT_DELETED: "REPORT_DELETED";
    readonly ASSIGNMENT_CREATED: "ASSIGNMENT_CREATED";
    readonly ASSIGNMENT_UPDATED: "ASSIGNMENT_UPDATED";
    readonly ASSIGNMENT_DELETED: "ASSIGNMENT_DELETED";
    readonly LABOR_CATEGORY_CREATED: "LABOR_CATEGORY_CREATED";
    readonly LABOR_CATEGORY_UPDATED: "LABOR_CATEGORY_UPDATED";
    readonly LABOR_CATEGORY_ACTIVATED: "LABOR_CATEGORY_ACTIVATED";
    readonly LABOR_CATEGORY_DEACTIVATED: "LABOR_CATEGORY_DEACTIVATED";
    readonly LABOR_CATEGORY_DELETED: "LABOR_CATEGORY_DELETED";
    readonly ROLE_CREATED: "ROLE_CREATED";
    readonly ROLE_UPDATED: "ROLE_UPDATED";
    readonly ROLE_DELETED: "ROLE_DELETED";
    readonly LABOR_CLASSIFICATION_CREATED: "LABOR_CLASSIFICATION_CREATED";
    readonly LABOR_CLASSIFICATION_UPDATED: "LABOR_CLASSIFICATION_UPDATED";
    readonly LABOR_CLASSIFICATION_DELETED: "LABOR_CLASSIFICATION_DELETED";
    readonly EXCEL_EXPORT: "EXCEL_EXPORT";
    readonly APP_UPDATE_UPLOADED: "APP_UPDATE_UPLOADED";
    readonly APP_UPDATE_PUBLISHED: "APP_UPDATE_PUBLISHED";
    readonly APP_UPDATE_ARCHIVED: "APP_UPDATE_ARCHIVED";
    readonly APP_UPDATE_DELETED: "APP_UPDATE_DELETED";
    readonly APP_UPDATE_DOWNLOADED: "APP_UPDATE_DOWNLOADED";
};
export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];
/**
 * Valid state transitions for the Report state machine.
 */
export declare const ValidReportTransitions: Record<ReportStatusType, ReportStatusType[]>;
