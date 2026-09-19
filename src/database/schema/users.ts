import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core';
import { UserRole, UserStatus } from '../../config/constants.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    phoneNumber: varchar('phone_number', { length: 20 }).notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    role: varchar('role', { length: 50 }).notNull().default(UserRole.SITE_ENGINEER),
    status: varchar('status', { length: 20 }).notNull().default(UserStatus.ACTIVE),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [
    index('users_phone_idx').on(table.phoneNumber),
    index('users_role_idx').on(table.role),
    index('users_status_idx').on(table.status),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
