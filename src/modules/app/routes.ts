import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { UserRole, AuditAction } from '../../config/constants.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AppUpdateService } from './updateService.js';
import { logger } from '../../utils/logger.js';

export const appVersionRoutes: FastifyPluginAsync = async (fastify) => {
  // ==========================================
  // PUBLIC MOBILE / CLIENT ENDPOINTS
  // ==========================================

  /**
   * GET /api/v1/app/version
   * Retrieve the currently published application version metadata.
   * Flutter consumes this to perform authoritative versionCode comparison.
   */
  fastify.get(
    '/version',
    {
      schema: {
        description: 'Get current published application version metadata for in-app updates',
        tags: ['App Updates'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' },
              data: {
                type: ['object', 'null'],
                properties: {
                  id: { type: 'string' },
                  versionName: { type: 'string' },
                  versionCode: { type: 'number' },
                  version: { type: 'string' },
                  fileSize: { type: 'number' },
                  sha256: { type: 'string' },
                  checksum: { type: 'string' },
                  mandatory: { type: 'boolean' },
                  releaseNotes: { type: 'string' },
                  downloadUrl: { type: 'string' },
                  publishedAt: { type: ['string', 'null'] },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const published = await AppUpdateService.getPublishedRelease();

      if (!published) {
        return reply.send(successResponse(null, 'No published updates currently available'));
      }

      const versionMetadata = {
        id: published.id,
        versionName: published.versionName,
        versionCode: published.versionCode,
        version: published.versionName, // For backward-compatibility with AppVersionInfo
        fileSize: published.fileSize,
        sha256: published.sha256,
        checksum: published.sha256, // For backward-compatibility with AppVersionInfo
        mandatory: published.mandatory,
        releaseNotes: published.releaseNotes || '',
        downloadUrl: '/api/v1/app/updates/download/latest',
        publishedAt: published.publishedAt ? published.publishedAt.toISOString() : null,
      };

      return reply.send(successResponse(versionMetadata, 'Latest application version metadata retrieved'));
    }
  );

  /**
   * GET /api/v1/app/updates/download/latest
   * Streams the currently published APK file.
   */
  fastify.get(
    '/updates/download/latest',
    {
      schema: {
        description: 'Stream currently published APK binary package',
        tags: ['App Updates'],
      },
    },
    async (request, reply) => {
      const resolved = await AppUpdateService.resolveLatestPublishedApk();
      if (!resolved) {
        return reply.status(404).send(errorResponse('NOT_FOUND', 'No published APK is available for download'));
      }

      const { filePath, release } = resolved;
      const stat = await fs.promises.stat(filePath);

      // Audit download event
      recordAudit({
        userId: request.user?.id,
        action: AuditAction.APP_UPDATE_DOWNLOADED,
        entityType: 'app_release',
        entityId: release.id,
        metadata: {
          versionName: release.versionName,
          versionCode: release.versionCode,
          filename: release.filename,
          fileSize: stat.size,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      }).catch(() => {});

      reply.type('application/vnd.android.package-archive');
      reply.header('Content-Length', stat.size);
      reply.header('Content-Disposition', `attachment; filename="${release.filename}"`);
      reply.header('Cache-Control', 'public, max-age=3600');

      return reply.send(fs.createReadStream(filePath));
    }
  );

  /**
   * GET /api/v1/app/updates/download/:filename
   * Streams a specific APK version by filename.
   * Filename is validated against database release records to prevent path traversal.
   */
  fastify.get(
    '/updates/download/:filename',
    {
      schema: {
        description: 'Stream verified versioned APK binary package',
        tags: ['App Updates'],
        params: {
          type: 'object',
          required: ['filename'],
          properties: {
            filename: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { filename } = request.params as { filename: string };

      const resolved = await AppUpdateService.resolveApkPath(filename);
      if (!resolved) {
        return reply.status(404).send(errorResponse('NOT_FOUND', `Requested APK "${filename}" was not found or is invalid.`));
      }

      const { filePath, release } = resolved;
      const stat = await fs.promises.stat(filePath);

      reply.type('application/vnd.android.package-archive');
      reply.header('Content-Length', stat.size);
      reply.header('Content-Disposition', `attachment; filename="${release.filename}"`);
      reply.header('Cache-Control', 'public, max-age=3600');

      return reply.send(fs.createReadStream(filePath));
    }
  );

  // ==========================================
  // AUTHENTICATED ADMIN-ONLY ENDPOINTS
  // ==========================================

  fastify.register(async (adminRouter) => {
    adminRouter.addHook('preHandler', authenticate);
    adminRouter.addHook('preHandler', requireRoles(UserRole.ADMIN));

    /**
     * GET /api/v1/app/updates
     * List all releases (draft, published, archived).
     */
    adminRouter.get(
      '/updates',
      {
        schema: {
          description: 'List all application releases (Admin only)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
        },
      },
      async (_request, reply) => {
        const releases = await AppUpdateService.listReleases();
        return reply.send(successResponse(releases, 'Application releases retrieved'));
      }
    );

    /**
     * GET /api/v1/app/updates/:id
     * Retrieve a specific release record.
     */
    adminRouter.get(
      '/updates/:id',
      {
        schema: {
          description: 'Get application release by ID (Admin only)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const release = await AppUpdateService.getReleaseById(id);
        if (!release) {
          return reply.status(404).send(errorResponse('NOT_FOUND', 'Release not found'));
        }
        return reply.send(successResponse(release, 'Release details retrieved'));
      }
    );

    /**
     * POST /api/v1/app/updates/upload
     * Upload an APK file with multipart form data.
     * Validates package, extracts versionName/versionCode, and creates draft release.
     */
    adminRouter.post(
      '/updates/upload',
      {
        schema: {
          description: 'Upload an APK package to create a draft release (Admin only)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
        },
      },
      async (request, reply) => {
        const user = request.user!;

        // Handle multipart data
        const data = await request.file();
        if (!data) {
          return reply.status(400).send(errorResponse('BAD_REQUEST', 'No APK file uploaded. Use field name "apk" or "file".'));
        }

        const originalName = data.filename || '';
        if (!originalName.toLowerCase().endsWith('.apk')) {
          return reply.status(400).send(errorResponse('INVALID_FILE_TYPE', 'Only .apk files are supported'));
        }

        // Save uploaded stream to temporary file for inspection
        const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${path.basename(originalName)}`);
        try {
          await pipeline(data.file, fs.createWriteStream(tempFilePath));

          // Extract non-file fields if provided
          const fields = data.fields as Record<string, any> | undefined;
          let releaseNotes: string | undefined;
          let mandatory = false;

          if (fields) {
            if (fields.releaseNotes && typeof fields.releaseNotes.value === 'string') {
              releaseNotes = fields.releaseNotes.value;
            }
            if (fields.mandatory) {
              const val = fields.mandatory.value;
              mandatory = val === true || val === 'true' || val === '1';
            }
          }

          // Create draft release with validation & extraction
          const draft = await AppUpdateService.createDraftRelease({
            tempFilePath,
            releaseNotes,
            mandatory,
            userId: user.id,
          });

          // Record audit log
          await recordAudit({
            userId: user.id,
            action: AuditAction.APP_UPDATE_UPLOADED,
            entityType: 'app_release',
            entityId: draft.id,
            metadata: {
              versionName: draft.versionName,
              versionCode: draft.versionCode,
              packageName: draft.packageName,
              fileSize: draft.fileSize,
              sha256: draft.sha256,
              filename: draft.filename,
            },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          });

          return reply.status(201).send(successResponse(draft, 'APK uploaded and validated successfully as a draft release'));
        } catch (err: any) {
          // Clean up temp file if still present
          if (fs.existsSync(tempFilePath)) {
            try {
              fs.unlinkSync(tempFilePath);
            } catch (_) {}
          }
          logger.error({ err }, '[APK_UPLOAD] Upload or validation error');
          return reply.status(400).send(errorResponse('VALIDATION_FAILED', err?.message || 'Failed to process and validate uploaded APK.'));
        }
      }
    );

    /**
     * POST /api/v1/app/updates/:id/publish
     * Atomically publishes the specified draft release.
     */
    adminRouter.post(
      '/updates/:id/publish',
      {
        schema: {
          description: 'Publish a draft application release (Admin only)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user!;

        try {
          const published = await AppUpdateService.publishRelease(id, user.id);

          await recordAudit({
            userId: user.id,
            action: AuditAction.APP_UPDATE_PUBLISHED,
            entityType: 'app_release',
            entityId: published.id,
            metadata: {
              versionName: published.versionName,
              versionCode: published.versionCode,
              filename: published.filename,
              fileSize: published.fileSize,
            },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          });

          return reply.send(successResponse(published, `Application version ${published.versionName} published successfully`));
        } catch (err: any) {
          logger.error({ err, releaseId: id }, '[APK_PUBLISH] Failed to publish release');
          return reply.status(400).send(errorResponse('PUBLISH_FAILED', err?.message || 'Failed to publish release'));
        }
      }
    );

    /**
     * POST /api/v1/app/updates/:id/archive
     * Mark a release as archived.
     */
    adminRouter.post(
      '/updates/:id/archive',
      {
        schema: {
          description: 'Archive an application release (Admin only)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user!;

        try {
          const archived = await AppUpdateService.archiveRelease(id);

          await recordAudit({
            userId: user.id,
            action: AuditAction.APP_UPDATE_ARCHIVED,
            entityType: 'app_release',
            entityId: archived.id,
            metadata: {
              versionName: archived.versionName,
              versionCode: archived.versionCode,
            },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          });

          return reply.send(successResponse(archived, `Release ${archived.versionName} archived`));
        } catch (err: any) {
          return reply.status(400).send(errorResponse('ARCHIVE_FAILED', err?.message || 'Failed to archive release'));
        }
      }
    );

    /**
     * DELETE /api/v1/app/updates/:id
     * Delete a release record (and file if unreferenced).
     */
    adminRouter.delete(
      '/updates/:id',
      {
        schema: {
          description: 'Delete a draft or archived release (Admin only)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const user = request.user!;

        try {
          await AppUpdateService.deleteRelease(id);

          await recordAudit({
            userId: user.id,
            action: AuditAction.APP_UPDATE_DELETED,
            entityType: 'app_release',
            entityId: id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          });

          return reply.send(successResponse({ id }, 'Release deleted successfully'));
        } catch (err: any) {
          return reply.status(400).send(errorResponse('DELETE_FAILED', err?.message || 'Failed to delete release'));
        }
      }
    );
  });
};
