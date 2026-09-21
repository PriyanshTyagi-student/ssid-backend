import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { hasPermission } from '../../config/permissions.js';
import { getDb } from '../../database/connection.js';
import { laborCategories } from '../../database/schema/labor_categories.js';
import { laborClassifications } from '../../database/schema/labor_classifications.js';
import { users } from '../../database/schema/users.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction } from '../../config/constants.js';
import { eq, and, asc, sql, ilike, or } from 'drizzle-orm';
export const laborCategoryRoutes = async (fastify) => {
    // Authentication hook for all routes
    fastify.addHook('preHandler', authenticate);
    // GET /api/v1/labor-categories
    fastify.get('/', {
        preHandler: [requirePermission('labor_categories.view')],
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
    }, async (request, reply) => {
        const user = request.user;
        const query = request.query;
        const db = getDb();
        // Users with manage/edit/view_inactive or wildcard can view inactive categories
        const canViewInactive = (hasPermission(user.permissions, 'labor_categories.manage') ||
            hasPermission(user.permissions, 'labor_categories.edit') ||
            hasPermission(user.permissions, 'labor_categories.view_inactive') ||
            hasPermission(user.permissions, '*')) &&
            (query.includeInactive === true || query.includeInactive === 'true');
        const conditions = [];
        if (!canViewInactive) {
            conditions.push(eq(laborCategories.isActive, true));
        }
        if (query.categoryType) {
            conditions.push(eq(laborCategories.categoryType, query.categoryType));
        }
        const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
        const categories = await db
            .select({
            id: laborCategories.id,
            name: laborCategories.name,
            nameEn: laborCategories.nameEn,
            nameHi: laborCategories.nameHi,
            categoryType: laborCategories.categoryType,
            orderIndex: laborCategories.orderIndex,
            isActive: laborCategories.isActive,
            createdBy: laborCategories.createdBy,
            creatorName: users.name,
            updatedBy: laborCategories.updatedBy,
            createdAt: laborCategories.createdAt,
            updatedAt: laborCategories.updatedAt,
        })
            .from(laborCategories)
            .leftJoin(users, eq(laborCategories.createdBy, users.id))
            .where(whereClause)
            .orderBy(asc(laborCategories.categoryType), asc(laborCategories.orderIndex), asc(laborCategories.name));
        return reply.send(successResponse(categories, 'Labor categories retrieved successfully'));
    });
    // GET /api/v1/labor-categories/classifications
    fastify.get('/classifications', {
        preHandler: [requirePermission('labor_categories.view')],
        schema: {
            description: 'Get all labor category classifications with category counts and system status',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
        },
    }, async (_request, reply) => {
        const db = getDb();
        // Query from labor_classifications joined with labor_categories
        const classifications = await db
            .select({
            id: laborClassifications.id,
            code: laborClassifications.code,
            classification: laborClassifications.code, // compatibility alias
            name: laborClassifications.name,
            description: laborClassifications.description,
            isSystem: laborClassifications.isSystem,
            createdAt: laborClassifications.createdAt,
            updatedAt: laborClassifications.updatedAt,
            total: sql `count(${laborCategories.id})::int`,
            activeCount: sql `count(${laborCategories.id}) filter (where ${laborCategories.isActive} = true)::int`,
        })
            .from(laborClassifications)
            .leftJoin(laborCategories, eq(laborCategories.categoryType, laborClassifications.code))
            .groupBy(laborClassifications.id)
            .orderBy(asc(laborClassifications.isSystem), asc(laborClassifications.name));
        return reply.send(successResponse(classifications, 'Labor classifications retrieved successfully'));
    });
    function hasClassificationManagePermission(user) {
        return (hasPermission(user.permissions, 'labor_categories.manage') ||
            hasPermission(user.permissions, 'labor_categories.edit') ||
            hasPermission(user.permissions, 'labor_categories.create') ||
            hasPermission(user.permissions, '*'));
    }
    // POST /api/v1/labor-categories/classifications
    fastify.post('/classifications', {
        preHandler: [requirePermission('labor_categories.create', 'labor_categories.manage')],
        schema: {
            description: 'Create a new labor category classification',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['name'],
                properties: {
                    name: { type: 'string', minLength: 2, maxLength: 100 },
                    code: { type: 'string', minLength: 2, maxLength: 50 },
                    description: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        if (!(await hasClassificationManagePermission(user))) {
            return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions to create classifications'));
        }
        const body = request.body;
        const name = body.name.trim();
        let code = (body.code || '').trim().toLowerCase();
        if (!code) {
            code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        }
        const db = getDb();
        const [existing] = await db
            .select()
            .from(laborClassifications)
            .where(eq(laborClassifications.code, code))
            .limit(1);
        if (existing) {
            return reply.status(409).send(errorResponse('CONFLICT', `A classification with code "${code}" already exists`));
        }
        const [newClassification] = await db
            .insert(laborClassifications)
            .values({
            name,
            code,
            description: body.description?.trim() || null,
            isSystem: false,
        })
            .returning();
        await recordAudit({
            userId: user.id,
            action: AuditAction.LABOR_CLASSIFICATION_CREATED,
            entityType: 'labor_classification',
            entityId: newClassification.id,
            metadata: { name: newClassification.name, code: newClassification.code },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.status(201).send(successResponse(newClassification, 'Classification created successfully'));
    });
    // PUT /api/v1/labor-categories/classifications/:code
    fastify.put('/classifications/:code', {
        preHandler: [requirePermission('labor_categories.edit', 'labor_categories.manage')],
        schema: {
            description: 'Update or rename a labor classification',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string' } },
            },
            body: {
                type: 'object',
                properties: {
                    name: { type: 'string', minLength: 2, maxLength: 100 },
                    newCode: { type: 'string', minLength: 2, maxLength: 50 },
                    description: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        if (!(await hasClassificationManagePermission(user))) {
            return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions to update classifications'));
        }
        const { code } = request.params;
        const body = request.body;
        const db = getDb();
        const [existing] = await db
            .select()
            .from(laborClassifications)
            .where(or(eq(laborClassifications.code, code), eq(laborClassifications.code, code.toLowerCase()), ilike(laborClassifications.code, code), ilike(laborClassifications.name, code)))
            .limit(1);
        if (!existing) {
            return reply.status(404).send(errorResponse('NOT_FOUND', `Classification "${code}" not found`));
        }
        const updateData = {
            updatedAt: new Date(),
        };
        if (body.name !== undefined) {
            updateData.name = body.name.trim();
        }
        if (body.description !== undefined) {
            updateData.description = body.description.trim() || null;
        }
        // Handle code renaming if requested
        if (body.newCode !== undefined && body.newCode.trim().toLowerCase() !== code) {
            const newCode = body.newCode.trim().toLowerCase();
            const [conflict] = await db
                .select()
                .from(laborClassifications)
                .where(eq(laborClassifications.code, newCode))
                .limit(1);
            if (conflict) {
                return reply.status(409).send(errorResponse('CONFLICT', `Classification code "${newCode}" is already in use`));
            }
            updateData.code = newCode;
            // Cascade code update to all linked categories
            await db
                .update(laborCategories)
                .set({ categoryType: newCode, updatedAt: new Date() })
                .where(eq(laborCategories.categoryType, code));
        }
        const [updated] = await db
            .update(laborClassifications)
            .set(updateData)
            .where(eq(laborClassifications.id, existing.id))
            .returning();
        await recordAudit({
            userId: user.id,
            action: AuditAction.LABOR_CLASSIFICATION_UPDATED,
            entityType: 'labor_classification',
            entityId: existing.id,
            metadata: {
                previous: { code: existing.code, name: existing.name },
                updated: { code: updated.code, name: updated.name },
            },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.send(successResponse(updated, 'Classification updated successfully'));
    });
    // DELETE /api/v1/labor-categories/classifications/:code
    fastify.delete('/classifications/:code', {
        preHandler: [requirePermission('labor_categories.delete', 'labor_categories.manage')],
        schema: {
            description: 'Delete a custom classification (fails if categories are attached)',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['code'],
                properties: { code: { type: 'string' } },
            },
            querystring: {
                type: 'object',
                properties: {
                    cascade: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        if (!(await hasClassificationManagePermission(user))) {
            return reply.status(403).send(errorResponse('FORBIDDEN', 'Insufficient permissions to delete classifications'));
        }
        const { code } = request.params;
        const { cascade } = request.query || {};
        const db = getDb();
        // Find classification case-insensitively by code or name
        const [classification] = await db
            .select()
            .from(laborClassifications)
            .where(or(eq(laborClassifications.code, code), eq(laborClassifications.code, code.toLowerCase()), ilike(laborClassifications.code, code), ilike(laborClassifications.name, code)))
            .limit(1);
        if (!classification) {
            // If classification record does not exist in labor_classifications table,
            // check if there are orphaned categories matching this code (case-insensitively)
            const [orphanedCount] = await db
                .select({ count: sql `count(*)::int` })
                .from(laborCategories)
                .where(or(eq(laborCategories.categoryType, code), eq(laborCategories.categoryType, code.toLowerCase()), ilike(laborCategories.categoryType, code)));
            const oCount = Number(orphanedCount?.count ?? 0);
            if (oCount > 0) {
                if (cascade) {
                    await db.delete(laborCategories).where(or(eq(laborCategories.categoryType, code), eq(laborCategories.categoryType, code.toLowerCase()), ilike(laborCategories.categoryType, code)));
                    return reply.send(successResponse({ code }, `Deleted ${oCount} labor categories belonging to "${code}"`));
                }
                else {
                    return reply.status(409).send({
                        success: false,
                        error: {
                            code: 'CLASSIFICATION_IN_USE',
                            message: `Cannot delete classification "${code}" because it contains ${oCount} labor categories. Pass cascade=true to delete both classification and its categories.`,
                        },
                    });
                }
            }
            return reply.status(404).send(errorResponse('NOT_FOUND', `Classification "${code}" not found`));
        }
        // Check if categories are assigned to this classification (case-insensitive)
        const targetCode = classification.code;
        const [categoryCount] = await db
            .select({ count: sql `count(*)::int` })
            .from(laborCategories)
            .where(or(eq(laborCategories.categoryType, targetCode), ilike(laborCategories.categoryType, targetCode), eq(laborCategories.categoryType, code), ilike(laborCategories.categoryType, code)));
        const count = Number(categoryCount?.count ?? 0);
        if (count > 0) {
            if (cascade) {
                // Cascade delete all child categories
                await db.delete(laborCategories).where(or(eq(laborCategories.categoryType, targetCode), ilike(laborCategories.categoryType, targetCode), eq(laborCategories.categoryType, code), ilike(laborCategories.categoryType, code)));
            }
            else {
                return reply.status(409).send({
                    success: false,
                    error: {
                        code: 'CLASSIFICATION_IN_USE',
                        message: `Cannot delete classification "${classification.name}" because it contains ${count} labor categor${count > 1 ? 'ies' : 'y'}. Pass cascade=true to delete both classification and its categories.`,
                    },
                });
            }
        }
        await db.delete(laborClassifications).where(eq(laborClassifications.id, classification.id));
        await recordAudit({
            userId: user.id,
            action: AuditAction.LABOR_CLASSIFICATION_DELETED,
            entityType: 'labor_classification',
            entityId: classification.id,
            metadata: { deletedName: classification.name, deletedCode: classification.code, cascadedCategoriesCount: count },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.send(successResponse({ code }, `Classification "${classification.name}" deleted successfully`));
    });
    // PUT /api/v1/labor-categories/classifications/rename
    fastify.put('/classifications/rename', {
        preHandler: [requirePermission('labor_categories.edit', 'labor_categories.manage')],
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
    }, async (request, reply) => {
        const user = request.user;
        const body = request.body;
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
            .select({ name: sql `lower(${laborCategories.name})` })
            .from(laborCategories)
            .where(eq(laborCategories.categoryType, newClassification));
        const newNames = new Set(existingNew.map((e) => e.name));
        const colliding = existingOld.find((c) => newNames.has(c.name.toLowerCase()));
        if (colliding) {
            return reply.status(409).send(errorResponse('CONFLICT', `Cannot rename: category "${colliding.name}" already exists in classification "${newClassification}"`));
        }
        // Perform update on categories
        await db
            .update(laborCategories)
            .set({
            categoryType: newClassification,
            updatedAt: new Date(),
        })
            .where(eq(laborCategories.categoryType, oldClassification));
        // Also update or insert in labor_classifications
        await db
            .insert(laborClassifications)
            .values({
            code: newClassification,
            name: newClassification.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            isSystem: false,
        })
            .onConflictDoNothing();
        await recordAudit({
            userId: user.id,
            action: AuditAction.LABOR_CLASSIFICATION_UPDATED,
            entityType: 'labor_classification',
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
    });
    // POST /api/v1/labor-categories
    fastify.post('/', {
        preHandler: [requirePermission('labor_categories.create')],
        schema: {
            description: 'Create a new labor category under a specified classification',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['categoryType'],
                properties: {
                    name: { type: 'string', maxLength: 255 },
                    nameEn: { type: 'string', maxLength: 150 },
                    nameHi: { type: 'string', maxLength: 150 },
                    categoryType: { type: 'string', minLength: 1, maxLength: 50 },
                    orderIndex: { type: 'integer', minimum: 0 },
                    isActive: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        const body = request.body;
        const nameEn = body.nameEn?.trim() || '';
        const nameHi = body.nameHi?.trim() || '';
        let name = body.name?.trim() || '';
        if (!name && nameEn) {
            name = nameHi ? `${nameEn} (${nameHi})` : nameEn;
        }
        const categoryType = body.categoryType.trim();
        if (!name) {
            return reply.status(400).send(errorResponse('BAD_REQUEST', 'Category name or English name cannot be empty'));
        }
        if (!categoryType) {
            return reply.status(400).send(errorResponse('BAD_REQUEST', 'Category classification cannot be empty'));
        }
        const db = getDb();
        // Check case-insensitive duplicate in the same categoryType (active or inactive)
        const normalizedName = name.toLowerCase();
        const [existing] = await db
            .select()
            .from(laborCategories)
            .where(and(eq(laborCategories.categoryType, categoryType), sql `lower(trim(${laborCategories.name})) = ${normalizedName}`))
            .limit(1);
        if (existing) {
            return reply
                .status(409)
                .send(errorResponse('CONFLICT', 'A classification with this name already exists.'));
        }
        // Determine orderIndex if not provided
        let orderIndex = body.orderIndex;
        if (orderIndex === undefined) {
            const [maxOrder] = await db
                .select({ max: sql `COALESCE(MAX(${laborCategories.orderIndex}), 0)` })
                .from(laborCategories)
                .where(eq(laborCategories.categoryType, categoryType));
            orderIndex = Number(maxOrder?.max ?? 0) + 1;
        }
        const [newCategory] = await db
            .insert(laborCategories)
            .values({
            name,
            nameEn: nameEn || name,
            nameHi: nameHi || null,
            categoryType,
            orderIndex,
            isActive: body.isActive !== undefined ? body.isActive : true,
            createdBy: user.id,
            updatedBy: user.id,
        })
            .returning();
        await recordAudit({
            userId: user.id,
            action: AuditAction.LABOR_CATEGORY_CREATED,
            entityType: 'labor_category',
            entityId: newCategory.id,
            metadata: {
                name: newCategory.name,
                nameEn: newCategory.nameEn,
                nameHi: newCategory.nameHi,
                categoryType: newCategory.categoryType,
                orderIndex: newCategory.orderIndex,
            },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.status(201).send(successResponse(newCategory, 'Labor category created successfully'));
    });
    // PATCH /api/v1/labor-categories/:id
    fastify.patch('/:id', {
        preHandler: [requirePermission('labor_categories.edit')],
        schema: {
            description: 'Update a labor category',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', format: 'uuid' } },
            },
            body: {
                type: 'object',
                properties: {
                    name: { type: 'string', maxLength: 255 },
                    nameEn: { type: 'string', maxLength: 150 },
                    nameHi: { type: 'string', maxLength: 150 },
                    categoryType: { type: 'string', minLength: 1, maxLength: 50 },
                    orderIndex: { type: 'integer', minimum: 0 },
                    isActive: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const body = request.body;
        const db = getDb();
        const [category] = await db.select().from(laborCategories).where(eq(laborCategories.id, id)).limit(1);
        if (!category) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Labor category not found'));
        }
        const updateData = {
            updatedAt: new Date(),
            updatedBy: user.id,
        };
        if (body.nameEn !== undefined || body.nameHi !== undefined) {
            const finalNameEn = body.nameEn !== undefined ? body.nameEn.trim() : (category.nameEn || '');
            const finalNameHi = body.nameHi !== undefined ? body.nameHi.trim() : (category.nameHi || '');
            updateData.nameEn = finalNameEn || null;
            updateData.nameHi = finalNameHi || null;
            if (finalNameEn) {
                updateData.name = finalNameHi ? `${finalNameEn} (${finalNameHi})` : finalNameEn;
            }
        }
        if (body.name !== undefined && body.nameEn === undefined) {
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
            .where(and(eq(laborCategories.categoryType, targetType), sql `lower(trim(${laborCategories.name})) = ${targetName.trim().toLowerCase()}`, sql `${laborCategories.id} != ${id}`))
            .limit(1);
        if (duplicate) {
            return reply
                .status(409)
                .send(errorResponse('CONFLICT', 'A classification with this name already exists.'));
        }
        const [updated] = await db
            .update(laborCategories)
            .set(updateData)
            .where(eq(laborCategories.id, id))
            .returning();
        // Audit logging
        let action = AuditAction.LABOR_CATEGORY_UPDATED;
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
    });
    // DELETE /api/v1/labor-categories/:id
    fastify.delete('/:id', {
        preHandler: [requirePermission('labor_categories.delete')],
        schema: {
            description: 'Delete a labor category (historical reports preserve snapshot)',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', format: 'uuid' } },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const db = getDb();
        const [category] = await db.select().from(laborCategories).where(eq(laborCategories.id, id)).limit(1);
        if (!category) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Labor category not found'));
        }
        // Historical report_entries preserve snapshots (trade, classificationNameSnapshot, totalWorkers, presentWorkers, absentWorkers)
        // so categories can be deleted freely without corrupting historical report data.
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
    });
    // PATCH /api/v1/labor-categories/:id/deactivate
    fastify.patch('/:id/deactivate', {
        preHandler: [requirePermission('labor_categories.edit')],
        schema: {
            description: 'Deactivate a labor category safely (preserves historical reports)',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', format: 'uuid' } },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const db = getDb();
        const [category] = await db.select().from(laborCategories).where(eq(laborCategories.id, id)).limit(1);
        if (!category) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Labor category not found'));
        }
        const [updated] = await db
            .update(laborCategories)
            .set({ isActive: false, updatedBy: user.id, updatedAt: new Date() })
            .where(eq(laborCategories.id, id))
            .returning();
        await recordAudit({
            userId: user.id,
            action: AuditAction.LABOR_CATEGORY_DEACTIVATED,
            entityType: 'labor_category',
            entityId: id,
            metadata: { name: category.name, categoryType: category.categoryType },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.send(successResponse(updated, 'Labor category deactivated successfully'));
    });
    // PATCH /api/v1/labor-categories/:id/reactivate
    fastify.patch('/:id/reactivate', {
        preHandler: [requirePermission('labor_categories.edit')],
        schema: {
            description: 'Reactivate an inactive labor category',
            tags: ['Labor Categories'],
            security: [{ bearerAuth: [] }],
            params: {
                type: 'object',
                required: ['id'],
                properties: { id: { type: 'string', format: 'uuid' } },
            },
        },
    }, async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const db = getDb();
        const [category] = await db.select().from(laborCategories).where(eq(laborCategories.id, id)).limit(1);
        if (!category) {
            return reply.status(404).send(errorResponse('NOT_FOUND', 'Labor category not found'));
        }
        const [updated] = await db
            .update(laborCategories)
            .set({ isActive: true, updatedBy: user.id, updatedAt: new Date() })
            .where(eq(laborCategories.id, id))
            .returning();
        await recordAudit({
            userId: user.id,
            action: AuditAction.LABOR_CATEGORY_ACTIVATED,
            entityType: 'labor_category',
            entityId: id,
            metadata: { name: category.name, categoryType: category.categoryType },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.send(successResponse(updated, 'Labor category reactivated successfully'));
    });
};
//# sourceMappingURL=routes.js.map