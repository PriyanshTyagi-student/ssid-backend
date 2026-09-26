import { pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const laborCategories = pgTable(
  'labor_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    nameEn: varchar('name_en', { length: 150 }),
    nameHi: varchar('name_hi', { length: 150 }),
    categoryType: varchar('category_type', { length: 50 }).notNull(), // 'company', 'custom', or parent category code
    parentId: uuid('parent_id').references((): any => laborCategories.id), // For hierarchical classifications
    orderIndex: integer('order_index').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('labor_cat_type_name_uniq_idx').on(table.categoryType, table.name),
    index('labor_cat_type_idx').on(table.categoryType),
    index('labor_cat_order_idx').on(table.orderIndex),
    index('labor_cat_active_idx').on(table.isActive),
    index('labor_cat_parent_idx').on(table.parentId),
  ]
);

export type LaborCategory = typeof laborCategories.$inferSelect;
export type NewLaborCategory = typeof laborCategories.$inferInsert;