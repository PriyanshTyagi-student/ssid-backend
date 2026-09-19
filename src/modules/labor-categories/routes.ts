import { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { getDb } from '../../database/connection.js';
import { laborCategories } from '../../database/schema/labor_categories.js';
import { reportEntries } from '../../database/schema/reports.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction, UserRole, LaborCategoryType } from '../../config/constants.js';
import { eq, and, asc, sql } from 'drizzle-orm';

export const laborCategoryRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication hook for all routes
  fastify.addHook('preHandler', authenticate);

  // GET /api/v1/labor-categories
  fastify.get(
    '/',
    {
      schema: {
        description: 'List labor categories (active by default, ordered by order_index)',
        tags: ['Labor Categories'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            includeInactive: { type: 'boolean' },
            categoryType: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const query = request.query as { includeInactive?: boolean | string; categoryType?: string };
      const db = getDb();

      // Only Admin / Project Manager can view inactive categories
      const canViewInactive =
        (user.role === UserRole.ADMIN || user.role === UserRole.PROJECT_MANAGER) &&
        (query.includeInactive === true || query.includeInactive === 'true');

      const conditions: any[] = [];
      if (!canViewInactive) {
        conditions.push(eq(laborCategories.isActive, true));
      }
      if (query.categoryType) {
        conditions.push(eq(laborCategories.categoryType, query.categoryType));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const categories = await db
        .select()
        .from(laborCategories)
        .where(whereClause)
        .orderBy(asc(laborCategories.categoryType), asc(laborCategories.orderIndex), asc(laborCategories.name));

      return reply.send(successResponse(categories, 'Labor categories retrieved successfully'));
    }
  );

  // GET /api/v1/labor-categories/classifications
  fastify.get(
    '/classifications',
    {
      schema: {
        description: 'Get all distinct labor category classifications with counts',
        tags: ['Labor Categories'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const db = getDb();
      const distinctTypes = await db
        .select({
          classification: laborCategories.categoryType,
          total: sql<number>`count(*)::int`,
          activeCount: sql<number>`count(*) filter (where ${laborCategories.isActive} = true)::int`,
        })
        .from(laborCategories)
        .groupBy(laborCategories.categoryType)
        .orderBy(asc(laborCategories.categoryType));

      return reply.send(successResponse(distinctTypes, 'Labor classifications retrieved successfully'));
    }
  );

  // PUT /api/v1/labor-categories/classifications/rename (Admin only)
  fastify.put(
    '/classifications/rename',
    {
      schema: {
        description: 'Rename an entire classification across all assigned labor categories',
        tags: ['Labor Categories'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['oldClassification', 'newClassification'],
          properties: {
            oldClassification: { type: 'string', minLength: 1, maxLength: 50 },
            newClassification: { type: 'string', minLength: 1, maxLength: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can rename classifications'));
      }

      const body = request.body as { oldClassification: string; newClassification: string };
      const oldClassification = (body.oldClassification || '').trim();
      const newClassification = (body.newClassification || '').trim();

      if (!oldClassification || !newClassification) {
        return reply.status(400).send(errorResponse('BAD_REQUEST', 'Classification names cannot be empty'));
      }

      if (oldClassification.toLowerCase() === newClassification.toLowerCase()) {
        return reply.status(400).send(errorResponse('BAD_REQUEST', 'New classification name must be different'));
      }

      const db = getDb();

      // Check if categories exist with old classification
      const existingOld = await db
        .select()
        .from(laborCategories)
        .where(eq(laborCategories.categoryType, oldClassification));

      if (existingOld.length === 0) {
        return reply.status(404).send(errorResponse('NOT_FOUND', `No categories found under classification "${oldClassification}"`));
      }

      // Check for name collisions under new classification
      const existingNew = await db
        .select({ name: sql<string>`lower(${laborCategories.name})` })
        .from(laborCategories)
        .where(eq(laborCategories.categoryType, newClassification));

      const newNames = new Set(existingNew.map((e: any) => e.name));
      const colliding = existingOld.find((c: any) => newNames.has(c.name.toLowerCase()));
      if (colliding) {
        return reply.status(409).send(errorResponse(
          'CONFLICT',
          `Cannot rename: category "${colliding.name}" already exists in classification "${newClassification}"`
        ));
      }

      // Perform update
      await db
        .update(laborCategories)
        .set({
          categoryType: newClassification,
          updatedAt: new Date(),
        })
        .where(eq(laborCategories.categoryType, oldClassification));

      await recordAudit({
        userId: user.id,
        action: AuditAction.LABOR_CATEGORY_UPDATED,
        entityType: 'labor_category',
        metadata: {
          action: 'rename_classification',
          oldClassification,
          newClassification,
          affectedCount: existingOld.length,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse({
        renamedFrom: oldClassification,
        renamedTo: newClassification,
        affectedCount: existingOld.length,
      }, `Successfully renamed classification "${oldClassification}" to "${newClassification}"`));
    }
  );

  // POST /api/v1/labor-categories (Admin only)
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new labor category with flexible classification',
        tags: ['Labor Categories'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['name', 'categoryType'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            categoryType: { type: 'string', minLength: 1, maxLength: 50 },
            orderIndex: { type: 'integer', minimum: 0 },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can manage labor categories'));
      }

      const body = request.body as {
        name: string;
        categoryType: string;
        orderIndex?: number;
        isActive?: boolean;
      };

      const name = body.name.trim();
      const categoryType = body.categoryType.trim();
      if (!name) {
        return reply.status(400).send(errorResponse('BAD_REQUEST', 'Category name cannot be empty'));
      }
      if (!categoryType) {
        return reply.status(400).send(errorResponse('BAD_REQUEST', 'Category classification cannot be empty'));
      }

      const db = getDb();

      // Check case-insensitive duplicate in the same categoryType
      const [existing] = await db
        .select()
        .from(laborCategories)
        .where(
          and(
            eq(laborCategories.categoryType, categoryType),
            sql`lower(${laborCategories.name}) = lower(${name})`
          )
        )
        .limit(1);

      if (existing) {
        return reply
          .status(409)
          .send(errorResponse('DUPLICATE_CATEGORY', `A category named "${name}" already exists under ${categoryType}`));
      }

      // Determine orderIndex if not provided
      let orderIndex = body.orderIndex;
      if (orderIndex === undefined) {
        const [maxOrder] = await db
          .select({ max: sql<number>`COALESCE(MAX(${laborCategories.orderIndex}), 0)` })
          .from(laborCategories)
          .where(eq(laborCategories.categoryType, categoryType));
        orderIndex = Number(maxOrder?.max ?? 0) + 1;
      }

      const [newCategory] = await db
        .insert(laborCategories)
        .values({
          name,
          categoryType,
          orderIndex,
          isActive: body.isActive !== undefined ? body.isActive : true,
        })
        .returning();

      await recordAudit({
        userId: user.id,
        action: AuditAction.LABOR_CATEGORY_CREATED,
        entityType: 'labor_category',
        entityId: newCategory.id,
        metadata: {
          name: newCategory.name,
          categoryType: newCategory.categoryType,
          orderIndex: newCategory.orderIndex,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.status(201).send(successResponse(newCategory, 'Labor category created successfully'));
    }
  );

  // PUT /api/v1/labor-categories/:id (Admin only)
  fastify.put(
    '/:id',
    {
      schema: {
        description: 'Update a labor category',
        tags: ['Labor Categories'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            categoryType: { type: 'string', minLength: 1, maxLength: 50 },
            orderIndex: { type: 'integer', minimum: 0 },
            isActive: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can manage labor categories'));
      }

      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        categoryType?: string;
        orderIndex?: number;
        isActive?: boolean;
      };

      const db = getDb();
      const [category] = await db.select().from(laborCategories).where(eq(laborCategories.id, id)).limit(1);
      if (!category) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Labor category not found'));
      }

      const updateData: Partial<typeof laborCategories.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (body.name !== undefined) {
        const trimmed = body.name.trim();
        if (!trimmed) {
          return reply.status(400).send(errorResponse('BAD_REQUEST', 'Category name cannot be empty'));
        }
        updateData.name = trimmed;
      }

      if (body.categoryType !== undefined) {
        const trimmedType = body.categoryType.trim();
        if (!trimmedType) {
          return reply.status(400).send(errorResponse('BAD_REQUEST', 'Category classification cannot be empty'));
        }
        updateData.categoryType = trimmedType;
      }

      if (body.orderIndex !== undefined) {
        updateData.orderIndex = body.orderIndex;
      }

      if (body.isActive !== undefined) {
        updateData.isActive = body.isActive;
      }

      // Check duplicate name under target categoryType if changing name or categoryType
      const targetName = updateData.name ?? category.name;
      const targetType = updateData.categoryType ?? category.categoryType;

      const [duplicate] = await db
        .select()
        .from(laborCategories)
        .where(
          and(
            eq(laborCategories.categoryType, targetType),
            sql`lower(${laborCategories.name}) = lower(${targetName})`,
            sql`${laborCategories.id} != ${id}`
          )
        )
        .limit(1);

      if (duplicate) {
        return reply
          .status(409)
          .send(errorResponse('DUPLICATE_CATEGORY', `A category named "${targetName}" already exists under ${targetType}`));
      }

      const [updated] = await db
        .update(laborCategories)
        .set(updateData)
        .where(eq(laborCategories.id, id))
        .returning();

      // Audit logging
      let action: any = AuditAction.LABOR_CATEGORY_UPDATED;
      if (body.isActive !== undefined && body.isActive !== category.isActive) {
        action = body.isActive ? AuditAction.LABOR_CATEGORY_ACTIVATED : AuditAction.LABOR_CATEGORY_DEACTIVATED;
      }

      await recordAudit({
        userId: user.id,
        action,
        entityType: 'labor_category',
        entityId: id,
        metadata: {
          previous: {
            name: category.name,
            categoryType: category.categoryType,
            orderIndex: category.orderIndex,
            isActive: category.isActive,
          },
          updated: {
            name: updated.name,
            categoryType: updated.categoryType,
            orderIndex: updated.orderIndex,
            isActive: updated.isActive,
          },
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse(updated, 'Labor category updated successfully'));
    }
  );

  // DELETE /api/v1/labor-categories/:id (Admin only, safety checked)
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete a labor category (rejects if historical reports reference it)',
        tags: ['Labor Categories'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      if (user.role !== UserRole.ADMIN) {
        return reply.status(403).send(errorResponse('FORBIDDEN', 'Only administrators can delete labor categories'));
      }

      const { id } = request.params as { id: string };
      const db = getDb();

      const [category] = await db.select().from(laborCategories).where(eq(laborCategories.id, id)).limit(1);
      if (!category) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'Labor category not found'));
      }

      // Check if referenced in historical report_entries
      // Reports store labor entries with trade name or category ID in entryData
      const [usageCheck] = await db
        .select({ id: reportEntries.id })
        .from(reportEntries)
        .where(
          sql`${reportEntries.entryData}->>'categoryId' = ${id} OR ${reportEntries.entryData}->>'trade' = ${category.name}`
        )
        .limit(1);

      if (usageCheck) {
        return reply.status(409).send({
          success: false,
          error: {
            code: 'CATEGORY_IN_USE',
            message:
              'This category is already referenced by existing reports. Deactivate it instead of deleting it to preserve historical integrity.',
          },
        });
      }

      await db.delete(laborCategories).where(eq(laborCategories.id, id));

      await recordAudit({
        userId: user.id,
        action: AuditAction.LABOR_CATEGORY_DELETED,
        entityType: 'labor_category',
        entityId: id,
        metadata: {
          deletedName: category.name,
          categoryType: category.categoryType,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return reply.send(successResponse({ id }, 'Labor category deleted successfully'));
    }
  );
};
