import { getDb } from '../../database/connection.js';
import { reports, reportSections, reportEntries } from '../../database/schema/reports.js';
import { sites } from '../../database/schema/sites.js';
import { projects } from '../../database/schema/projects.js';
import { users } from '../../database/schema/users.js';
import { userProjectAssignments, userSiteAssignments } from '../../database/schema/assignments.js';
import { eq, and, desc, count, inArray, gte, lte } from 'drizzle-orm';
import { generateReportNumber } from '../../utils/reportNumber.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction, ReportStatus, UserRole, type ReportTypeType } from '../../config/constants.js';
import type { CreateReportInput, ListReportsQuery } from './schema.js';

export class ReportService {
  /**
   * List reports with comprehensive filtering, pagination, and role-based scoping.
   */
  static async listReports(query: ListReportsQuery, user: any) {
    const db = getDb();
    const offset = (query.page - 1) * query.limit;

    const conditions: any[] = [];

    // Role-based scoping: Site engineers/supervisors only see reports for sites they are assigned to
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
      const assignments = await db
        .select({ siteId: userSiteAssignments.siteId })
        .from(userSiteAssignments)
        .where(eq(userSiteAssignments.userId, user.id));

      const assignedSiteIds = assignments.map((a: { siteId: string }) => a.siteId);
      if (assignedSiteIds.length === 0) {
        return {
          reports: [],
          meta: { page: query.page, limit: query.limit, total: 0, totalPages: 0 },
        };
      }
      conditions.push(inArray(reports.siteId, assignedSiteIds));
    }

    if (query.reportType) conditions.push(eq(reports.reportType, query.reportType));
    if (query.projectId) conditions.push(eq(reports.projectId, query.projectId));
    if (query.siteId) conditions.push(eq(reports.siteId, query.siteId));
    if (query.status) conditions.push(eq(reports.status, query.status));
    if (query.createdBy) conditions.push(eq(reports.createdBy, query.createdBy));
    if (query.dateFrom) conditions.push(gte(reports.reportDate, query.dateFrom));
    if (query.dateTo) conditions.push(lte(reports.reportDate, query.dateTo));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes] = await db.select({ count: count() }).from(reports).where(whereClause);
    const total = Number(totalRes.count);

    const reportList = await db
      .select({
        id: reports.id,
        reportNumber: reports.reportNumber,
        reportType: reports.reportType,
        projectId: reports.projectId,
        projectName: projects.name,
        siteId: reports.siteId,
        siteName: sites.name,
        reportDate: reports.reportDate,
        status: reports.status,
        createdBy: reports.createdBy,
        creatorName: users.name,
        submittedAt: reports.submittedAt,
        reviewedAt: reports.reviewedAt,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .innerJoin(projects, eq(reports.projectId, projects.id))
      .innerJoin(sites, eq(reports.siteId, sites.id))
      .innerJoin(users, eq(reports.createdBy, users.id))
      .where(whereClause)
      .limit(query.limit)
      .offset(offset)
      .orderBy(desc(reports.createdAt));

    return {
      reports: reportList,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Get single report by ID including all sections and entries.
   */
  static async getReportById(id: string, user: any) {
    const db = getDb();

    const [report] = await db
      .select({
        id: reports.id,
        reportNumber: reports.reportNumber,
        reportType: reports.reportType,
        projectId: reports.projectId,
        projectName: projects.name,
        siteId: reports.siteId,
        siteName: sites.name,
        reportDate: reports.reportDate,
        status: reports.status,
        createdBy: reports.createdBy,
        creatorName: users.name,
        submittedAt: reports.submittedAt,
        reviewedAt: reports.reviewedAt,
        reviewedBy: reports.reviewedBy,
        rejectionReason: reports.rejectionReason,
        createdAt: reports.createdAt,
        updatedAt: reports.updatedAt,
      })
      .from(reports)
      .innerJoin(projects, eq(reports.projectId, projects.id))
      .innerJoin(sites, eq(reports.siteId, sites.id))
      .innerJoin(users, eq(reports.createdBy, users.id))
      .where(eq(reports.id, id))
      .limit(1);

    if (!report) {
      throw new Error('Report not found');
    }

    // Role verification
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.PROJECT_MANAGER) {
      const [assignment] = await db
        .select()
        .from(userSiteAssignments)
        .where(and(eq(userSiteAssignments.userId, user.id), eq(userSiteAssignments.siteId, report.siteId)))
        .limit(1);

      if (!assignment) {
        throw new Error('You do not have access to reports for this site');
      }
    }

    // Fetch sections and their entries
    const sections = await db
      .select()
      .from(reportSections)
      .where(eq(reportSections.reportId, id))
      .orderBy(reportSections.sortOrder);

    const fullSections = await Promise.all(
      sections.map(async (sec: any) => {
        const entries = await db
          .select()
          .from(reportEntries)
          .where(eq(reportEntries.sectionId, sec.id))
          .orderBy(reportEntries.sortOrder);

        return {
          ...sec,
          entries,
        };
      })
    );

    return {
      ...report,
      sections: fullSections,
    };
  }

  /**
   * Create report with sections and entries inside a database transaction.
   */
  static async createReport(
    input: CreateReportInput,
    userId: string,
    userRole: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();

    // 1. Verify site belongs to project
    const [site] = await db.select().from(sites).where(eq(sites.id, input.siteId)).limit(1);
    if (!site || site.projectId !== input.projectId) {
      throw new Error('Selected site does not belong to the specified project');
    }

    // 2. Verify user is assigned to project or site (unless Admin/PM)
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.PROJECT_MANAGER) {
      const [projectAssignment] = await db
        .select()
        .from(userProjectAssignments)
        .where(and(eq(userProjectAssignments.userId, userId), eq(userProjectAssignments.projectId, input.projectId)))
        .limit(1);

      const [siteAssignment] = await db
        .select()
        .from(userSiteAssignments)
        .where(and(eq(userSiteAssignments.userId, userId), eq(userSiteAssignments.siteId, input.siteId)))
        .limit(1);

      if (!siteAssignment && !projectAssignment) {
        throw new Error('You are not authorized to submit reports for this site or project');
      }
    }

    // 3. Count reports today to generate daily sequence
    const today = new Date(input.reportDate);
    const [todayCountRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(
        and(
          eq(reports.reportType, input.reportType),
          eq(reports.reportDate, input.reportDate)
        )
      );

    const sequence = Number(todayCountRes.count) + 1;
    const reportNumber = generateReportNumber(input.reportType as ReportTypeType, today, sequence);

    // 4. Transactional insert
    const createdReport = await db.transaction(async (tx: any) => {
      const [newReport] = await tx
        .insert(reports)
        .values({
          reportNumber,
          reportType: input.reportType,
          projectId: input.projectId,
          siteId: input.siteId,
          reportDate: input.reportDate,
          createdBy: userId,
          status: ReportStatus.DRAFT,
        })
        .returning();

      for (const sec of input.sections) {
        const [createdSection] = await tx
          .insert(reportSections)
          .values({
            reportId: newReport.id,
            sectionType: sec.sectionType,
            sectionName: sec.sectionName,
            sortOrder: sec.sortOrder,
          })
          .returning();

        if (sec.entries && sec.entries.length > 0) {
          const entryValues = sec.entries.map((entry: any) => ({
            sectionId: createdSection.id,
            entryData: entry.entryData,
            sortOrder: entry.sortOrder,
          }));

          await tx.insert(reportEntries).values(entryValues);
        }
      }

      return newReport;
    });

    await recordAudit({
      userId,
      action: AuditAction.REPORT_CREATED,
      entityType: 'report',
      entityId: createdReport.id,
      metadata: {
        reportNumber: createdReport.reportNumber,
        reportType: createdReport.reportType,
        siteId: createdReport.siteId,
      },
      ipAddress,
      userAgent,
    });

    return createdReport;
  }

  /**
   * Submit report — enforces state transition to SUBMITTED.
   */
  static async submitReport(
    reportId: string,
    userId: string,
    userRole: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();

    const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);

    if (!report) {
      throw new Error('Report not found');
    }

    // Only creator or admin/PM can submit
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.PROJECT_MANAGER && report.createdBy !== userId) {
      throw new Error('Only the report author or administrator can submit this report');
    }

    // State machine: can only submit if currently in DRAFT or REJECTED
    if (report.status !== ReportStatus.DRAFT && report.status !== ReportStatus.REJECTED) {
      throw new Error(`Invalid state transition: Cannot submit a report in '${report.status}' status`);
    }

    const [updatedReport] = await db
      .update(reports)
      .set({
        status: ReportStatus.SUBMITTED,
        submittedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))
      .returning();

    await recordAudit({
      userId,
      action: AuditAction.REPORT_SUBMITTED,
      entityType: 'report',
      entityId: reportId,
      metadata: { reportNumber: report.reportNumber, previousStatus: report.status },
      ipAddress,
      userAgent,
    });

    return updatedReport;
  }

  /**
   * Start review of report (SUBMITTED -> UNDER_REVIEW).
   */
  static async reviewReport(
    reportId: string,
    reviewerId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);

    if (!report) {
      throw new Error('Report not found');
    }

    if (report.status !== ReportStatus.SUBMITTED) {
      throw new Error(`Cannot start review on a report with status '${report.status}'`);
    }

    const [updatedReport] = await db
      .update(reports)
      .set({
        status: ReportStatus.UNDER_REVIEW,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))
      .returning();

    await recordAudit({
      userId: reviewerId,
      action: AuditAction.REPORT_UPDATED,
      entityType: 'report',
      entityId: reportId,
      metadata: { reportNumber: report.reportNumber, previousStatus: report.status, newStatus: ReportStatus.UNDER_REVIEW },
      ipAddress,
      userAgent,
    });

    return updatedReport;
  }

  /**
   * Approve report (SUBMITTED or UNDER_REVIEW -> APPROVED).
   */
  static async approveReport(
    reportId: string,
    reviewerId: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);

    if (!report) {
      throw new Error('Report not found');
    }

    if (report.status !== ReportStatus.SUBMITTED && report.status !== ReportStatus.UNDER_REVIEW) {
      throw new Error(`Cannot approve a report with status '${report.status}'`);
    }

    const [updatedReport] = await db
      .update(reports)
      .set({
        status: ReportStatus.APPROVED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: null,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))
      .returning();

    await recordAudit({
      userId: reviewerId,
      action: AuditAction.REPORT_APPROVED,
      entityType: 'report',
      entityId: reportId,
      metadata: { reportNumber: report.reportNumber, previousStatus: report.status },
      ipAddress,
      userAgent,
    });

    return updatedReport;
  }

  /**
   * Reject report with mandatory reason (SUBMITTED or UNDER_REVIEW -> REJECTED).
   */
  static async rejectReport(
    reportId: string,
    reviewerId: string,
    rejectionReason: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);

    if (!report) {
      throw new Error('Report not found');
    }

    if (!rejectionReason || rejectionReason.trim().length === 0) {
      throw new Error('Rejection reason is mandatory when rejecting a report');
    }

    if (report.status !== ReportStatus.SUBMITTED && report.status !== ReportStatus.UNDER_REVIEW) {
      throw new Error(`Cannot reject a report with status '${report.status}'`);
    }

    const [updatedReport] = await db
      .update(reports)
      .set({
        status: ReportStatus.REJECTED,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId))
      .returning();

    await recordAudit({
      userId: reviewerId,
      action: AuditAction.REPORT_REJECTED,
      entityType: 'report',
      entityId: reportId,
      metadata: { reportNumber: report.reportNumber, previousStatus: report.status, reason: rejectionReason.trim() },
      ipAddress,
      userAgent,
    });

    return updatedReport;
  }

  /**
   * Aggregated Dashboard Statistics.
   */
  static async getDashboardStats(user: any) {
    const db = getDb();
    const todayStr = new Date().toISOString().split('T')[0];

    // Reports today count by type
    const [materialTodayRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(and(eq(reports.reportType, 'material'), eq(reports.reportDate, todayStr)));

    const [laborTodayRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(and(eq(reports.reportType, 'labor'), eq(reports.reportDate, todayStr)));

    const [machineryTodayRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(and(eq(reports.reportType, 'machinery'), eq(reports.reportDate, todayStr)));

    // Reports count by status
    const [submittedRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(eq(reports.status, ReportStatus.SUBMITTED));

    const [underReviewRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(eq(reports.status, ReportStatus.UNDER_REVIEW));

    const [approvedRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(eq(reports.status, ReportStatus.APPROVED));

    const [rejectedRes] = await db
      .select({ count: count() })
      .from(reports)
      .where(eq(reports.status, ReportStatus.REJECTED));

    // Active entities
    const [activeProjectsRes] = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.status, 'active'));

    const [activeSitesRes] = await db
      .select({ count: count() })
      .from(sites)
      .where(eq(sites.status, 'active'));

    const [activeUsersRes] = await db
      .select({ count: count() })
      .from(users)
      .where(eq(users.status, 'active'));

    // Recent 5 reports
    const recentReports = await db
      .select({
        id: reports.id,
        reportNumber: reports.reportNumber,
        reportType: reports.reportType,
        siteName: sites.name,
        projectName: projects.name,
        creatorName: users.name,
        status: reports.status,
        reportDate: reports.reportDate,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .innerJoin(projects, eq(reports.projectId, projects.id))
      .innerJoin(sites, eq(reports.siteId, sites.id))
      .innerJoin(users, eq(reports.createdBy, users.id))
      .orderBy(desc(reports.createdAt))
      .limit(5);

    return {
      todayDate: todayStr,
      reportsToday: {
        material: Number(materialTodayRes.count),
        labor: Number(laborTodayRes.count),
        machinery: Number(machineryTodayRes.count),
        total: Number(materialTodayRes.count) + Number(laborTodayRes.count) + Number(machineryTodayRes.count),
      },
      reportStatus: {
        submitted: Number(submittedRes.count),
        underReview: Number(underReviewRes.count),
        approved: Number(approvedRes.count),
        rejected: Number(rejectedRes.count),
      },
      counts: {
        activeProjects: Number(activeProjectsRes.count),
        activeSites: Number(activeSitesRes.count),
        activeUsers: Number(activeUsersRes.count),
      },
      recentReports,
    };
  }

  /**
   * Export reports as CSV data.
   */
  static async exportReports(
    query: ListReportsQuery,
    user: any,
    ipAddress?: string,
    userAgent?: string
  ) {
    const listResult = await this.listReports({ ...query, page: 1, limit: 1000 }, user);
    const rows = listResult.reports;

    // Build CSV
    const headers = ['Report Number', 'Date', 'Type', 'Project', 'Site', 'Submitted By', 'Status', 'Created At'];
    const csvLines = [headers.join(',')];

    for (const r of rows) {
      const line = [
        `"${r.reportNumber}"`,
        `"${r.reportDate}"`,
        `"${r.reportType}"`,
        `"${r.projectName.replace(/"/g, '""')}"`,
        `"${r.siteName.replace(/"/g, '""')}"`,
        `"${r.creatorName.replace(/"/g, '""')}"`,
        `"${r.status}"`,
        `"${new Date(r.createdAt).toISOString()}"`,
      ];
      csvLines.push(line.join(','));
    }

    await recordAudit({
      userId: user.id,
      action: AuditAction.EXCEL_EXPORT,
      entityType: 'report',
      metadata: { filter: query, count: rows.length },
      ipAddress,
      userAgent,
    });

    return {
      csvData: csvLines.join('\n'),
      filename: `Reports_Export_${new Date().toISOString().split('T')[0]}.csv`,
      totalRecords: rows.length,
    };
  }

  /**
   * Get submission status for today's reports for the current user.
   */
  static async getTodaySummary(userId: string) {
    const db = getDb();
    const todayStr = new Date().toISOString().split('T')[0];

    const todayReports = await db
      .select({
        id: reports.id,
        reportType: reports.reportType,
        status: reports.status,
        reportNumber: reports.reportNumber,
      })
      .from(reports)
      .where(and(eq(reports.createdBy, userId), eq(reports.reportDate, todayStr)));

    const summary: Record<string, any> = {
      material: { status: 'not_started', id: null, reportNumber: null },
      labor: { status: 'not_started', id: null, reportNumber: null },
      machinery: { status: 'not_started', id: null, reportNumber: null },
    };

    for (const r of todayReports) {
      if (summary[r.reportType]) {
        summary[r.reportType] = {
          status: r.status,
          id: r.id,
          reportNumber: r.reportNumber,
        };
      }
    }

    return summary;
  }

  /**
   * Update report sections/entries if in DRAFT or REJECTED status.
   */
  static async updateReport(
    reportId: string,
    input: any,
    userId: string,
    userRole: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();

    const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (!report) {
      throw new Error('Report not found');
    }

    if (userRole !== UserRole.ADMIN && userRole !== UserRole.PROJECT_MANAGER && report.createdBy !== userId) {
      throw new Error('You can only edit your own reports');
    }

    if (report.status !== ReportStatus.DRAFT && report.status !== ReportStatus.REJECTED) {
      throw new Error(`Cannot edit report in '${report.status}' status`);
    }

    await db.transaction(async (tx: any) => {
      if (input.sections && input.sections.length > 0) {
        const oldSections = await tx
          .select({ id: reportSections.id })
          .from(reportSections)
          .where(eq(reportSections.reportId, reportId));
        const oldSectionIds = oldSections.map((s: any) => s.id);
        if (oldSectionIds.length > 0) {
          await tx.delete(reportEntries).where(inArray(reportEntries.sectionId, oldSectionIds));
          await tx.delete(reportSections).where(eq(reportSections.reportId, reportId));
        }

        for (const sec of input.sections) {
          const [createdSec] = await tx
            .insert(reportSections)
            .values({
              reportId,
              sectionType: sec.sectionType,
              sectionName: sec.sectionName,
              sortOrder: sec.sortOrder || 0,
            })
            .returning();

          if (sec.entries && sec.entries.length > 0) {
            const entryValues = sec.entries.map((entry: any) => ({
              sectionId: createdSec.id,
              entryData: entry.entryData,
              sortOrder: entry.sortOrder || 0,
            }));
            await tx.insert(reportEntries).values(entryValues);
          }
        }
      }

      await tx
        .update(reports)
        .set({
          updatedAt: new Date(),
        })
        .where(eq(reports.id, reportId));
    });

    await recordAudit({
      userId,
      action: AuditAction.REPORT_UPDATED,
      entityType: 'report',
      entityId: reportId,
      metadata: { reportNumber: report.reportNumber },
      ipAddress,
      userAgent,
    });

    return await ReportService.getReportById(reportId, { id: userId, role: userRole });
  }

  static async deleteReport(
    reportId: string,
    userId: string,
    userRole: string,
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();
    const [report] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (!report) {
      throw new Error('Report not found');
    }

    if (userRole !== UserRole.ADMIN && userRole !== UserRole.PROJECT_MANAGER) {
      if (report.createdBy !== userId) {
        throw new Error('You do not have permission to delete this report');
      }
      if (report.status !== ReportStatus.DRAFT && report.status !== ReportStatus.REJECTED) {
        throw new Error('Only draft or rejected reports can be deleted');
      }
    }

    // Delete sections and entries in case cascade FK is not strictly enforced by sqlite/pglite
    const sections = await db
      .select({ id: reportSections.id })
      .from(reportSections)
      .where(eq(reportSections.reportId, reportId));
    const sectionIds = sections.map((s: any) => s.id);
    if (sectionIds.length > 0) {
      await db.delete(reportEntries).where(inArray(reportEntries.sectionId, sectionIds));
      await db.delete(reportSections).where(eq(reportSections.reportId, reportId));
    }

    await db.delete(reports).where(eq(reports.id, reportId));

    await recordAudit({
      userId,
      action: AuditAction.REPORT_DELETED,
      entityType: 'report',
      entityId: reportId,
      metadata: { reportNumber: report.reportNumber, reportType: report.reportType, status: report.status },
      ipAddress,
      userAgent,
    });

    return { id: reportId, deleted: true };
  }
}

