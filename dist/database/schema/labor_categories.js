import { pgTable, uuid, varchar, integer, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
export const laborCategories = pgTable('labor_categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    categoryType: varchar('category_type', { length: 50 }).notNull(), // 'skilled', 'unskilled', 'supervisory'
    orderIndex: integer('order_index').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    uniqueIndex('labor_cat_type_name_uniq_idx').on(table.categoryType, table.name),
    index('labor_cat_type_idx').on(table.categoryType),
    index('labor_cat_order_idx').on(table.orderIndex),
    index('labor_cat_active_idx').on(table.isActive),
]);
//# sourceMappingURL=labor_categories.js.map