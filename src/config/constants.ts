export const UserRole = {
  ADMIN: 'admin',
  PROJECT_MANAGER: 'project_manager',
  SITE_ENGINEER: 'site_engineer',
  SITE_SUPERVISOR: 'site_supervisor',
} as const;

export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  ACTIVE: 'active',
  DISABLED: 'disabled',
} as const;

export type UserStatusType = (typeof UserStatus)[keyof typeof UserStatus];

export const ProjectStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ProjectStatusType = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const SiteStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type SiteStatusType = (typeof SiteStatus)[keyof typeof SiteStatus];

export const ReportType = {
  MATERIAL: 'material',
  LABOR: 'labor',
  MACHINERY: 'machinery',
} as const;

export type ReportTypeType = (typeof ReportType)[keyof typeof ReportType];

export const ReportStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

export type ReportStatusType = (typeof ReportStatus)[keyof typeof ReportStatus];

export const LaborCategoryType = {
  SKILLED: 'skilled',
  UNSKILLED: 'unskilled',
  SUPERVISORY: 'supervisory',
} as const;

export type LaborCategoryTypeValue = (typeof LaborCategoryType)[keyof typeof LaborCategoryType];

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
  ROLE_CREATED: 'ROLE_CREATED',
  ROLE_UPDATED: 'ROLE_UPDATED',
  ROLE_DELETED: 'ROLE_DELETED',
  LABOR_CLASSIFICATION_CREATED: 'LABOR_CLASSIFICATION_CREATED',
  LABOR_CLASSIFICATION_UPDATED: 'LABOR_CLASSIFICATION_UPDATED',
  LABOR_CLASSIFICATION_DELETED: 'LABOR_CLASSIFICATION_DELETED',
  EXCEL_EXPORT: 'EXCEL_EXPORT',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

/**
 * Valid state transitions for the Report state machine.
 */
export const ValidReportTransitions: Record<ReportStatusType, ReportStatusType[]> = {
  [ReportStatus.DRAFT]: [ReportStatus.SUBMITTED],
  [ReportStatus.SUBMITTED]: [ReportStatus.UNDER_REVIEW, ReportStatus.APPROVED, ReportStatus.REJECTED],
  [ReportStatus.UNDER_REVIEW]: [ReportStatus.APPROVED, ReportStatus.REJECTED],
  [ReportStatus.REJECTED]: [ReportStatus.DRAFT], // After rejection, engineer edits and transitions back to draft/resubmit
  [ReportStatus.APPROVED]: [], // Terminal status
};
