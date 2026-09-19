import { pgTable, uuid, varchar, text, timestamp, date, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { ReportStatus, ReportType } from '../../config/constants.js';
import { users } from './users.js';
import { projects } from './projects.js';
import { sites } from './sites.js';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportNumber: varchar('report_number', { length: 50 }).notNull().unique(),
    reportType: varchar('report_type', { length: 30 }).notNull().default(ReportType.MATERIAL),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    reportDate: date('report_date').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    status: varchar('status', { length: 30 }).notNull().default(ReportStatus.DRAFT),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('reports_number_idx').on(table.reportNumber),
    index('reports_project_idx').on(table.projectId),
    index('reports_site_idx').on(table.siteId),
    index('reports_date_idx').on(table.reportDate),
    index('reports_type_idx').on(table.reportType),
    index('reports_status_idx').on(table.status),
    index('reports_created_by_idx').on(table.createdBy),
  ]
);

export const reportSections = pgTable(
  'report_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    sectionType: varchar('section_type', { length: 50 }).notNull(),
    sectionName: varchar('section_name', { length: 255 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('report_sections_report_idx').on(table.reportId),
  ]
);

export const reportEntries = pgTable(
  'report_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => reportSections.id, { onDelete: 'cascade' }),
    entryData: jsonb('entry_data').notNull().default({}),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('report_entries_section_idx').on(table.sectionId),
  ]
);

export type Report = typeof reports.$inferSelect;
export type NewReport = typeof reports.$inferInsert;
export type ReportSection = typeof reportSections.$inferSelect;
export type NewReportSection = typeof reportSections.$inferInsert;
export type ReportEntry = typeof reportEntries.$inferSelect;
export type NewReportEntry = typeof reportEntries.$inferInsert;
