import { ReportService } from './service.js';
import { createReportSchema, listReportsQuerySchema } from './schema.js';
import { successResponse, errorResponse } from '../../utils/response.js';
export class ReportController {
    static async list(request, reply) {
        const query = listReportsQuerySchema.parse(request.query);
        const result = await ReportService.listReports(query, request.user);
        return reply.send(successResponse(result.reports, 'Reports retrieved successfully', result.meta));
    }
    static async getById(request, reply) {
        const { id } = request.params;
        try {
            const report = await ReportService.getReportById(id, request.user);
            return reply.send(successResponse(report, 'Report retrieved successfully'));
        }
        catch (err) {
            return reply.status(404).send(errorResponse('NOT_FOUND', err.message));
        }
    }
    static async create(request, reply) {
        const input = createReportSchema.parse(request.body);
        try {
            const report = await ReportService.createReport(input, request.user.id, request.user.role, request.ip, request.headers['user-agent']);
            return reply.status(201).send(successResponse(report, 'Report created successfully'));
        }
        catch (err) {
            return reply.status(400).send(errorResponse('BAD_REQUEST', err.message));
        }
    }
    static async submit(request, reply) {
        const { id } = request.params;
        try {
            const report = await ReportService.submitReport(id, request.user.id, request.user.role, request.ip, request.headers['user-agent']);
            return reply.send(successResponse(report, 'Report submitted successfully'));
        }
        catch (err) {
            return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
        }
    }
    static async review(request, reply) {
        const { id } = request.params;
        try {
            const report = await ReportService.reviewReport(id, request.user.id, request.ip, request.headers['user-agent']);
            return reply.send(successResponse(report, 'Report under review'));
        }
        catch (err) {
            return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
        }
    }
    static async approve(request, reply) {
        const { id } = request.params;
        try {
            const report = await ReportService.approveReport(id, request.user.id, request.ip, request.headers['user-agent']);
            return reply.send(successResponse(report, 'Report approved successfully'));
        }
        catch (err) {
            return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
        }
    }
    static async reject(request, reply) {
        const { id } = request.params;
        const body = request.body || {};
        try {
            const report = await ReportService.rejectReport(id, request.user.id, body.reason || '', request.ip, request.headers['user-agent']);
            return reply.send(successResponse(report, 'Report rejected'));
        }
        catch (err) {
            return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
        }
    }
    static async stats(request, reply) {
        try {
            const stats = await ReportService.getDashboardStats(request.user);
            return reply.send(successResponse(stats, 'Dashboard stats retrieved'));
        }
        catch (err) {
            return reply.status(500).send(errorResponse('SERVER_ERROR', err.message));
        }
    }
    static async export(request, reply) {
        const query = listReportsQuerySchema.parse(request.query);
        try {
            const result = await ReportService.exportReports(query, request.user, request.ip, request.headers['user-agent']);
            return reply.send(successResponse(result, 'Export generated successfully'));
        }
        catch (err) {
            return reply.status(500).send(errorResponse('EXPORT_FAILED', err.message));
        }
    }
    static async todaySummary(request, reply) {
        try {
            const summary = await ReportService.getTodaySummary(request.user.id);
            return reply.send(successResponse(summary, 'Today summary retrieved'));
        }
        catch (err) {
            return reply.status(500).send(errorResponse('SERVER_ERROR', err.message));
        }
    }
    static async update(request, reply) {
        const { id } = request.params;
        try {
            const updated = await ReportService.updateReport(id, request.body, request.user.id, request.user.role, request.ip, request.headers['user-agent']);
            return reply.send(successResponse(updated, 'Report updated successfully'));
        }
        catch (err) {
            return reply.status(400).send(errorResponse('UPDATE_FAILED', err.message));
        }
    }
    static async delete(request, reply) {
        const { id } = request.params;
        try {
            const result = await ReportService.deleteReport(id, request.user.id, request.user.role, request.ip, request.headers['user-agent']);
            return reply.send(successResponse(result, 'Report deleted successfully'));
        }
        catch (err) {
            if (err.message === 'Report not found') {
                return reply.status(404).send(errorResponse('NOT_FOUND', err.message));
            }
            return reply.status(403).send(errorResponse('FORBIDDEN', err.message));
        }
    }
}
//# sourceMappingURL=controller.js.map