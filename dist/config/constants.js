export const UserRole = {
    ADMIN: 'admin',
    PROJECT_MANAGER: 'project_manager',
    SITE_ENGINEER: 'site_engineer',
    SITE_SUPERVISOR: 'site_supervisor',
};
export const UserStatus = {
    ACTIVE: 'active',
    DISABLED: 'disabled',
};
export const ProjectStatus = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
};
export const SiteStatus = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    ARCHIVED: 'archived',
};
export const ReportType = {
    MATERIAL: 'material',
    LABOR: 'labor',
    MACHINERY: 'machinery',
};
export const ReportStatus = {
    DRAFT: 'draft',
    SUBMITTED: 'submitted',
    UNDER_REVIEW: 'under_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
};
export const LaborCategoryType = {
    SKILLED: 'skilled',
    UNSKILLED: 'unskilled',
    SUPERVISORY: 'supervisory',
};
export const AuditAction = {
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_CREATED: 'USER_CREATED',
    USER_UPDATED: 'USER_UPDATED',
    USER_DISABLED: 'USER_DISABLED',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
    REPORT_CREATED: 'REPORT_CREATED',
    REPORT_UPDATED: 'REPORT_UPDATED',
    REPORT_SUBMITTED: 'REPORT_SUBMITTED',
    REPORT_REJECTED: 'REPORT_REJECTED',
    REPORT_APPROVED: 'REPORT_APPROVED',
    PROJECT_CREATED: 'PROJECT_CREATED',
    PROJECT_UPDATED: 'PROJECT_UPDATED',
    PROJECT_DELETED: 'PROJECT_DELETED',
    SITE_CREATED: 'SITE_CREATED',
    SITE_UPDATED: 'SITE_UPDATED',
    SITE_DELETED: 'SITE_DELETED',
    USER_DELETED: 'USER_DELETED',
    REPORT_DELETED: 'REPORT_DELETED',
    ASSIGNMENT_CREATED: 'ASSIGNMENT_CREATED',
    ASSIGNMENT_UPDATED: 'ASSIGNMENT_UPDATED',
    ASSIGNMENT_DELETED: 'ASSIGNMENT_DELETED',
    LABOR_CATEGORY_CREATED: 'LABOR_CATEGORY_CREATED',
    LABOR_CATEGORY_UPDATED: 'LABOR_CATEGORY_UPDATED',
    LABOR_CATEGORY_ACTIVATED: 'LABOR_CATEGORY_ACTIVATED',
    LABOR_CATEGORY_DEACTIVATED: 'LABOR_CATEGORY_DEACTIVATED',
    LABOR_CATEGORY_DELETED: 'LABOR_CATEGORY_DELETED',
    EXCEL_EXPORT: 'EXCEL_EXPORT',
};
/**
 * Valid state transitions for the Report state machine.
 */
export const ValidReportTransitions = {
    [ReportStatus.DRAFT]: [ReportStatus.SUBMITTED],
    [ReportStatus.SUBMITTED]: [ReportStatus.UNDER_REVIEW, ReportStatus.APPROVED, ReportStatus.REJECTED],
    [ReportStatus.UNDER_REVIEW]: [ReportStatus.APPROVED, ReportStatus.REJECTED],
    [ReportStatus.REJECTED]: [ReportStatus.DRAFT], // After rejection, engineer edits and transitions back to draft/resubmit
    [ReportStatus.APPROVED]: [], // Terminal status
};
//# sourceMappingURL=constants.js.map