import type { FastifyRequest, FastifyReply } from 'fastify';
import { ReportService } from './service.js';
import { createReportSchema, listReportsQuerySchema } from './schema.js';
import { successResponse, errorResponse } from '../../utils/response.js';

export class ReportController {
  static async list(request: FastifyRequest, reply: FastifyReply) {
    const query = listReportsQuerySchema.parse(request.query);
    const result = await ReportService.listReports(query, request.user);
    return reply.send(successResponse(result.reports, 'Reports retrieved successfully', result.meta));
  }

  static async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const report = await ReportService.getReportById(id, request.user);
      return reply.send(successResponse(report, 'Report retrieved successfully'));
    } catch (err: any) {
      return reply.status(404).send(errorResponse('NOT_FOUND', err.message));
    }
  }

  static async create(request: FastifyRequest, reply: FastifyReply) {
    const input = createReportSchema.parse(request.body);
    try {
      const report = await ReportService.createReport(
        input,
        request.user!,
        request.ip,
        request.headers['user-agent']
      );
      return reply.status(201).send(successResponse(report, 'Report created successfully'));
    } catch (err: any) {
      return reply.status(400).send(errorResponse('BAD_REQUEST', err.message));
    }
  }

  static async submit(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const report = await ReportService.submitReport(
        id,
        request.user!,
        request.ip,
        request.headers['user-agent']
      );
      return reply.send(successResponse(report, 'Report submitted successfully'));
    } catch (err: any) {
      return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
    }
  }

  static async review(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const report = await ReportService.reviewReport(
        id,
        request.user!.id,
        request.ip,
        request.headers['user-agent']
      );
      return reply.send(successResponse(report, 'Report under review'));
    } catch (err: any) {
      return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
    }
  }

  static async approve(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const report = await ReportService.approveReport(
        id,
        request.user!.id,
        request.ip,
        request.headers['user-agent']
      );
      return reply.send(successResponse(report, 'Report approved successfully'));
    } catch (err: any) {
      return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
    }
  }

  static async reject(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const body = (request.body as { reason?: string }) || {};
    try {
      const report = await ReportService.rejectReport(
        id,
        request.user!.id,
        body.reason || '',
        request.ip,
        request.headers['user-agent']
      );
      return reply.send(successResponse(report, 'Report rejected'));
    } catch (err: any) {
      return reply.status(400).send(errorResponse('STATE_ERROR', err.message));
    }
  }

  static async stats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await ReportService.getDashboardStats(request.user);
      return reply.send(successResponse(stats, 'Dashboard stats retrieved'));
    } catch (err: any) {
      return reply.status(500).send(errorResponse('SERVER_ERROR', err.message));
    }
  }

  static async export(request: FastifyRequest, reply: FastifyReply) {
    const query = listReportsQuerySchema.parse(request.query);
    try {
      const result = await ReportService.exportReports(
        query,
        request.user,
        request.ip,
        request.headers['user-agent']
      );
      return reply.send(successResponse(result, 'Export generated successfully'));
    } catch (err: any) {
      return reply.status(500).send(errorResponse('EXPORT_FAILED', err.message));
    }
  }

  static async todaySummary(request: FastifyRequest, reply: FastifyReply) {
    try {
      const summary = await ReportService.getTodaySummary(request.user!.id);
      return reply.send(successResponse(summary, 'Today summary retrieved'));
    } catch (err: any) {
      return reply.status(500).send(errorResponse('SERVER_ERROR', err.message));
    }
  }

  static async update(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const updated = await ReportService.updateReport(
        id,
        request.body,
        request.user!,
        request.ip,
        request.headers['user-agent']
      );
      return reply.send(successResponse(updated, 'Report updated successfully'));
    } catch (err: any) {
      return reply.status(400).send(errorResponse('UPDATE_FAILED', err.message));
    }
  }

  static async delete(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const result = await ReportService.deleteReport(
        id,
        request.user!,
        request.ip,
        request.headers['user-agent']
      );
      return reply.send(successResponse(result, 'Report deleted successfully'));
    } catch (err: any) {
      if (err.message === 'Report not found') {
        return reply.status(404).send(errorResponse('NOT_FOUND', err.message));
      }
      return reply.status(403).send(errorResponse('FORBIDDEN', err.message));
    }
  }
}

