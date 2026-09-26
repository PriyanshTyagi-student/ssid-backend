import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { AuditAction } from '../../config/constants.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AppUpdateService } from './updateService.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

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
  // AUTHENTICATED MANAGEMENT ENDPOINTS
  // ==========================================

  fastify.register(async (adminRouter) => {
    adminRouter.addHook('preHandler', authenticate);

    /**
     * GET /api/v1/app/updates
     * List all releases (draft, published, archived).
     */
    adminRouter.get(
      '/updates',
      {
        preHandler: [requirePermission('app_updates.view')],
        schema: {
          description: 'List all application releases',
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
        preHandler: [requirePermission('app_updates.view')],
        schema: {
          description: 'Get application release by ID',
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
        preHandler: [requirePermission('app_updates.upload')],
        bodyLimit: env.MAX_APK_SIZE_MB * 1024 * 1024,
        schema: {
          description: 'Upload an APK package to create a draft release (Supports multipart and direct high-speed raw streaming)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
        },
      },
      async (request, reply) => {
        const user = request.user!;

        // Enable TCP NoDelay for immediate packet transmission
        if (request.raw.socket) {
          request.raw.socket.setNoDelay(true);
        }

        const isMultipart = typeof (request as any).isMultipart === 'function' && (request as any).isMultipart();
        let streamSource: NodeJS.ReadableStream;
        let originalName = 'ssid-app.apk';
        let releaseNotes: string | undefined;
        let mandatory = false;
        let versionName: string | undefined;
        let versionCode: number | undefined;

        if (isMultipart) {
          if (typeof (request as any).file !== 'function') {
            return reply.status(503).send(errorResponse('SERVICE_UNAVAILABLE', '@fastify/multipart is not installed on this server. Run "npm install" on the server to enable uploads.'));
          }

          // Use 4MB buffers for maximum disk and network throughput
          const data = await (request as any).file({
            limits: { fileSize: env.MAX_APK_SIZE_MB * 1024 * 1024 },
            highWaterMark: 4 * 1024 * 1024,
            fileHwm: 4 * 1024 * 1024,
          });

          if (!data) {
            return reply.status(400).send(errorResponse('BAD_REQUEST', 'No APK file uploaded. Use field name "apk" or "file".'));
          }

          originalName = data.filename || 'ssid-app.apk';
          streamSource = data.file;

          const fields = data.fields as Record<string, any> | undefined;
          if (fields) {
            if (fields.releaseNotes && typeof fields.releaseNotes.value === 'string') {
              releaseNotes = fields.releaseNotes.value;
            }
            if (fields.mandatory) {
              const val = fields.mandatory.value;
              mandatory = val === true || val === 'true' || val === '1';
            }
            if (fields.versionName && typeof fields.versionName.value === 'string') {
              const trimmed = fields.versionName.value.trim();
              if (trimmed) versionName = trimmed;
            }
            if (fields.versionCode) {
              const rawVal = fields.versionCode.value;
              const parsed = typeof rawVal === 'string' ? parseInt(rawVal, 10) : Number(rawVal);
              if (!isNaN(parsed) && parsed > 0) versionCode = parsed;
            }
          }
        } else {
          // Direct Raw Binary Streaming (bypasses multipart boundary scanning for 2x-3x faster uploads)
          streamSource = request.raw;

          const query = (request.query || {}) as Record<string, any>;
          const headers = request.headers;

          originalName = (query.filename as string) ||
            (headers['x-filename'] as string) ||
            'ssid-app.apk';

          releaseNotes = (query.releaseNotes as string) ||
            (headers['x-release-notes'] as string);

          const rawMandatory = query.mandatory ?? headers['x-mandatory'];
          if (rawMandatory !== undefined) {
            mandatory = rawMandatory === true || rawMandatory === 'true' || rawMandatory === '1';
          }

          const rawVersionName = (query.versionName as string) || (headers['x-version-name'] as string);
          if (rawVersionName && rawVersionName.trim()) {
            versionName = rawVersionName.trim();
          }

          const rawVersionCode = query.versionCode || headers['x-version-code'];
          if (rawVersionCode) {
            const parsed = typeof rawVersionCode === 'string' ? parseInt(rawVersionCode, 10) : Number(rawVersionCode);
            if (!isNaN(parsed) && parsed > 0) versionCode = parsed;
          }
        }

        if (!originalName.toLowerCase().endsWith('.apk')) {
          return reply.status(400).send(errorResponse('INVALID_FILE_TYPE', 'Only .apk files are supported'));
        }

        // Create staging file directly inside storage directory for zero-copy atomic rename
        const stagingFilePath = AppUpdateService.createStagingFilePath(originalName);

        try {
          // Concurrently compute SHA-256 and total bytes in-flight while streaming from client
          const hash = crypto.createHash('sha256');
          let uploadedBytes = 0;

          // 4MB highWaterMark buffer to maximize streaming throughput without backpressure choking
          const hashTransform = new Transform({
            highWaterMark: 4 * 1024 * 1024,
            transform(chunk, _encoding, callback) {
              hash.update(chunk);
              uploadedBytes += chunk.length;
              callback(null, chunk);
            },
          });

          // 4MB highWaterMark buffer for disk write throughput
          const writeStream = fs.createWriteStream(stagingFilePath, { highWaterMark: 4 * 1024 * 1024 });

          await pipeline(streamSource, hashTransform, writeStream);
          const computedSha256 = hash.digest('hex');

          // Create draft release with instant atomic rename & precomputed hash/size
          const draft = await AppUpdateService.createDraftRelease({
            tempFilePath: stagingFilePath,
            precomputedSha256: computedSha256,
            precomputedSize: uploadedBytes,
            versionName,
            versionCode,
            releaseNotes,
            mandatory,
            userId: user.id,
          });

          // Record audit log asynchronously so client gets immediate HTTP response
          recordAudit({
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
          }).catch((err) => logger.warn({ err }, '[AUDIT] Failed to record upload audit'));

          return reply.status(201).send(successResponse(draft, 'APK uploaded and validated successfully as a draft release'));
        } catch (err: any) {
          // Clean up staging file if still present
          if (fs.existsSync(stagingFilePath)) {
            try {
              await fs.promises.unlink(stagingFilePath);
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
        preHandler: [requirePermission('app_updates.publish')],
        schema: {
          description: 'Publish a draft application release',
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
        preHandler: [requirePermission('app_updates.publish', 'app_updates.upload')],
        schema: {
          description: 'Archive an application release',
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
     * PATCH /api/v1/app/updates/:id
     * Update metadata of an existing application release (published, draft, or archived).
     */
    adminRouter.patch(
      '/updates/:id',
      {
        preHandler: [requirePermission('app_updates.publish', 'app_updates.upload')],
        schema: {
          description: 'Update metadata for an application release (published, draft, or archived)',
          tags: ['App Updates'],
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
          body: {
            type: 'object',
            properties: {
              versionName: { type: 'string' },
              versionCode: { type: 'integer', minimum: 1 },
              releaseNotes: { type: 'string', nullable: true },
              mandatory: { type: 'boolean' },
            },
          },
        },
      },
      async (request, reply) => {
        const { id } = request.params as { id: string };
        const body = request.body as {
          versionName?: string;
          versionCode?: number;
          releaseNotes?: string | null;
          mandatory?: boolean;
        };
        const user = request.user!;

        try {
          const updated = await AppUpdateService.updateRelease(id, body);

          await recordAudit({
            userId: user.id,
            action: AuditAction.APP_UPDATE_UPDATED,
            entityType: 'app_release',
            entityId: updated.id,
            metadata: {
              versionName: updated.versionName,
              versionCode: updated.versionCode,
              mandatory: updated.mandatory,
              status: updated.status,
            },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          });

          return reply.send(successResponse(updated, `Release ${updated.versionName} updated successfully`));
        } catch (err: any) {
          logger.error({ err, releaseId: id }, '[APK_UPDATE] Failed to update release');
          return reply.status(400).send(errorResponse('UPDATE_FAILED', err?.message || 'Failed to update release'));
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
        preHandler: [requirePermission('app_updates.delete')],
        schema: {
          description: 'Delete a draft or archived release',
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
