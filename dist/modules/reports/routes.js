import { ReportController } from './controller.js';
import { authenticate } from '../../middleware/auth.js';
export const reportRoutes = async (fastify) => {
    fastify.addHook('preHandler', authenticate);
    // GET /api/v1/reports
    fastify.get('/', {
        schema: {
            description: 'List reports with filtering, pagination, and assignment-based scoping',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
            querystring: {
                type: 'object',
                properties: {
                    page: { type: 'number', default: 1 },
                    limit: { type: 'number', default: 20 },
                    reportType: { type: 'string', enum: ['material', 'labor', 'machinery'] },
                    projectId: { type: 'string', format: 'uuid' },
                    siteId: { type: 'string', format: 'uuid' },
                    status: { type: 'string', enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected'] },
                    createdBy: { type: 'string', format: 'uuid' },
                    dateFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                    dateTo: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                },
            },
        },
    }, ReportController.list);
    // GET /api/v1/reports/stats/dashboard
    fastify.get('/stats/dashboard', {
        schema: {
            description: 'Get aggregate KPI metrics and status counts for admin dashboard',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.stats);
    // GET /api/v1/reports/export
    fastify.get('/export', {
        schema: {
            description: 'Export reports to CSV with audit logging',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.export);
    // GET /api/v1/reports/today-summary
    fastify.get('/today-summary', {
        schema: {
            description: "Get today's submission status for material, labor, and machinery",
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.todaySummary);
    // GET /api/v1/reports/:id
    fastify.get('/:id', {
        schema: {
            description: 'Get full report details including sections and entries',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.getById);
    // PATCH /api/v1/reports/:id
    fastify.patch('/:id', {
        schema: {
            description: 'Update report sections/entries (when in draft or rejected status)',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.update);
    // DELETE /api/v1/reports/:id
    fastify.delete('/:id', {
        schema: {
            description: 'Delete report and its sections/entries (Admin, or creator if draft/rejected)',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.delete);
    // POST /api/v1/reports
    fastify.post('/', {
        schema: {
            description: 'Create a new daily report (Material, Labor, or Machinery)',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['reportType', 'projectId', 'siteId', 'reportDate'],
                properties: {
                    reportType: { type: 'string', enum: ['material', 'labor', 'machinery'] },
                    projectId: { type: 'string', format: 'uuid' },
                    siteId: { type: 'string', format: 'uuid' },
                    reportDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                    sections: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['sectionType', 'sectionName'],
                            properties: {
                                sectionType: { type: 'string' },
                                sectionName: { type: 'string' },
                                sortOrder: { type: 'number' },
                                entries: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            entryData: { type: 'object' },
                                            sortOrder: { type: 'number' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    }, ReportController.create);
    // POST /api/v1/reports/:id/submit
    fastify.post('/:id/submit', {
        schema: {
            description: 'Submit report for review (state transition DRAFT -> SUBMITTED)',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.submit);
    // POST /api/v1/reports/:id/review
    fastify.post('/:id/review', {
        schema: {
            description: 'Mark report under review (state transition SUBMITTED -> UNDER_REVIEW)',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.review);
    // POST /api/v1/reports/:id/approve
    fastify.post('/:id/approve', {
        schema: {
            description: 'Approve report (state transition SUBMITTED/UNDER_REVIEW -> APPROVED)',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
        },
    }, ReportController.approve);
    // POST /api/v1/reports/:id/reject
    fastify.post('/:id/reject', {
        schema: {
            description: 'Reject report with reason (state transition SUBMITTED/UNDER_REVIEW -> REJECTED)',
            tags: ['Reports'],
            security: [{ bearerAuth: [] }],
            body: {
                type: 'object',
                required: ['reason'],
                properties: {
                    reason: { type: 'string', minLength: 1 },
                },
            },
        },
    }, ReportController.reject);
};
//# sourceMappingURL=routes.js.map