export * from './users.js';
export * from './projects.js';
export * from './sites.js';
export * from './assignments.js';
export * from './reports.js';
export * from './audit.js';
export * from './labor_categories.js';
export * from './roles.js';
export * from './labor_classifications.js';
export * from './app_releases.js';
export declare const usersRelations: import("drizzle-orm").Relations<"users", {
    projectAssignments: import("drizzle-orm").Many<"user_project_assignments">;
    siteAssignments: import("drizzle-orm").Many<"user_site_assignments">;
    createdReports: import("drizzle-orm").Many<"reports">;
    auditLogs: import("drizzle-orm").Many<"audit_logs">;
}>;
export declare const projectsRelations: import("drizzle-orm").Relations<"projects", {
    sites: import("drizzle-orm").Many<"sites">;
    userAssignments: import("drizzle-orm").Many<"user_project_assignments">;
    reports: import("drizzle-orm").Many<"reports">;
}>;
export declare const sitesRelations: import("drizzle-orm").Relations<"sites", {
    project: import("drizzle-orm").One<"projects", true>;
    userAssignments: import("drizzle-orm").Many<"user_site_assignments">;
    reports: import("drizzle-orm").Many<"reports">;
}>;
export declare const userProjectAssignmentsRelations: import("drizzle-orm").Relations<"user_project_assignments", {
    user: import("drizzle-orm").One<"users", true>;
    project: import("drizzle-orm").One<"projects", true>;
}>;
export declare const userSiteAssignmentsRelations: import("drizzle-orm").Relations<"user_site_assignments", {
    user: import("drizzle-orm").One<"users", true>;
    site: import("drizzle-orm").One<"sites", true>;
}>;
export declare const reportsRelations: import("drizzle-orm").Relations<"reports", {
    project: import("drizzle-orm").One<"projects", true>;
    site: import("drizzle-orm").One<"sites", true>;
    creator: import("drizzle-orm").One<"users", true>;
    sections: import("drizzle-orm").Many<"report_sections">;
}>;
export declare const reportSectionsRelations: import("drizzle-orm").Relations<"report_sections", {
    report: import("drizzle-orm").One<"reports", true>;
    entries: import("drizzle-orm").Many<"report_entries">;
}>;
export declare const reportEntriesRelations: import("drizzle-orm").Relations<"report_entries", {
    section: import("drizzle-orm").One<"report_sections", true>;
}>;
