import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { projects } from './projects.js';
import { sites } from './sites.js';

export const userProjectAssignments = pgTable(
  'user_project_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_project_uniq_idx').on(table.userId, table.projectId),
  ]
);

export const userSiteAssignments = pgTable(
  'user_site_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_site_uniq_idx').on(table.userId, table.siteId),
  ]
);

export type UserProjectAssignment = typeof userProjectAssignments.$inferSelect;
export type UserSiteAssignment = typeof userSiteAssignments.$inferSelect;
