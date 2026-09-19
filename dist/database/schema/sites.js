import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { SiteStatus } from '../../config/constants.js';
import { projects } from './projects.js';
export const sites = pgTable('sites', {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
        .notNull()
        .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    location: varchar('location', { length: 255 }),
    description: text('description'),
    status: varchar('status', { length: 20 }).notNull().default(SiteStatus.ACTIVE),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('sites_project_idx').on(table.projectId),
    index('sites_status_idx').on(table.status),
]);
//# sourceMappingURL=sites.js.map