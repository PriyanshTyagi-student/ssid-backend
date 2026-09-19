import { pgTable, uuid, varchar, text, timestamp, date, index } from 'drizzle-orm/pg-core';
import { ProjectStatus } from '../../config/constants.js';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    projectCode: varchar('project_code', { length: 50 }).notNull().unique(),
    clientName: varchar('client_name', { length: 255 }),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default(ProjectStatus.ACTIVE),
    startDate: date('start_date'),
    endDate: date('end_date'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('projects_code_idx').on(table.projectCode),
    index('projects_status_idx').on(table.status),
  ]
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
