import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const laborClassifications = pgTable(
  'labor_classifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: varchar('code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 100 }).notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('labor_class_code_idx').on(table.code),
    index('labor_class_is_system_idx').on(table.isSystem),
  ]
);

export type LaborClassification = typeof laborClassifications.$inferSelect;
export type NewLaborClassification = typeof laborClassifications.$inferInsert;
