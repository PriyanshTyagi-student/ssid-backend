import { relations } from 'drizzle-orm';
import { users } from './users.js';
import { projects } from './projects.js';
import { sites } from './sites.js';
import { userProjectAssignments, userSiteAssignments } from './assignments.js';
import { reports, reportSections, reportEntries } from './reports.js';
import { auditLogs } from './audit.js';

export * from './users.js';
export * from './projects.js';
export * from './sites.js';
export * from './assignments.js';
export * from './reports.js';
export * from './audit.js';
export * from './labor_categories.js';
export * from './roles.js';
export * from './labor_classifications.js';

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  projectAssignments: many(userProjectAssignments),
  siteAssignments: many(userSiteAssignments),
  createdReports: many(reports),
  auditLogs: many(auditLogs),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  sites: many(sites),
  userAssignments: many(userProjectAssignments),
  reports: many(reports),
}));

export const sitesRelations = relations(sites, ({ one, many }) => ({
  project: one(projects, {
    fields: [sites.projectId],
    references: [projects.id],
  }),
  userAssignments: many(userSiteAssignments),
  reports: many(reports),
}));

export const userProjectAssignmentsRelations = relations(userProjectAssignments, ({ one }) => ({
  user: one(users, {
    fields: [userProjectAssignments.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [userProjectAssignments.projectId],
    references: [projects.id],
  }),
}));

export const userSiteAssignmentsRelations = relations(userSiteAssignments, ({ one }) => ({
  user: one(users, {
    fields: [userSiteAssignments.userId],
    references: [users.id],
  }),
  site: one(sites, {
    fields: [userSiteAssignments.siteId],
    references: [sites.id],
  }),
}));

export const reportsRelations = relations(reports, ({ one, many }) => ({
  project: one(projects, {
    fields: [reports.projectId],
    references: [projects.id],
  }),
  site: one(sites, {
    fields: [reports.siteId],
    references: [sites.id],
  }),
  creator: one(users, {
    fields: [reports.createdBy],
    references: [users.id],
  }),
  sections: many(reportSections),
}));

export const reportSectionsRelations = relations(reportSections, ({ one, many }) => ({
  report: one(reports, {
    fields: [reportSections.reportId],
    references: [reports.id],
  }),
  entries: many(reportEntries),
}));

export const reportEntriesRelations = relations(reportEntries, ({ one }) => ({
  section: one(reportSections, {
    fields: [reportEntries.sectionId],
    references: [reportSections.id],
  }),
}));
