import { pgTable, uuid, varchar, text, integer, bigint, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
export const AppReleaseStatus = {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
};
export const appReleases = pgTable('app_releases', {
    id: uuid('id').primaryKey().defaultRandom(),
    versionName: varchar('version_name', { length: 50 }).notNull(),
    versionCode: integer('version_code').notNull(),
    packageName: varchar('package_name', { length: 255 }).notNull(),
    filename: varchar('filename', { length: 255 }).notNull(),
    fileSize: bigint('file_size', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    releaseNotes: text('release_notes'),
    mandatory: boolean('mandatory').notNull().default(false),
    status: varchar('status', { length: 20 }).notNull().default(AppReleaseStatus.DRAFT),
    uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    index('app_releases_status_idx').on(table.status),
    index('app_releases_version_code_idx').on(table.versionCode),
    index('app_releases_created_at_idx').on(table.createdAt),
]);
//# sourceMappingURL=app_releases.js.map