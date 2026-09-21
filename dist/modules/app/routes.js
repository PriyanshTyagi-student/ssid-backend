import fs from 'node:fs';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { AuditAction } from '../../config/constants.js';
import { successResponse, errorResponse } from '../../utils/response.js';
import { recordAudit } from '../audit/service.js';
import { AppUpdateService } from './updateService.js';
import { logger } from '../../utils/logger.js';
export const appVersionRoutes = async (fastify) => {
    // ==========================================
    // PUBLIC MOBILE / CLIENT ENDPOINTS
    // ==========================================
    /**
     * GET /api/v1/app/version
     * Retrieve the currently published application version metadata.
     * Flutter consumes this to perform authoritative versionCode comparison.
     */
    fastify.get('/version', {
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
    }, async (_request, reply) => {
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
    });
    /**
     * GET /api/v1/app/updates/download/latest
     * Streams the currently published APK file.
     */
    fastify.get('/updates/download/latest', {
        schema: {
            description: 'Stream currently published APK binary package',
            tags: ['App Updates'],
        },
    }, async (request, reply) => {
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
        }).catch(() => { });
        reply.type('application/vnd.android.package-archive');
        reply.header('Content-Length', stat.size);
        reply.header('Content-Disposition', `attachment; filename="${release.filename}"`);
        reply.header('Cache-Control', 'public, max-age=3600');
        return reply.send(fs.createReadStream(filePath));
    });
    /**
     * GET /api/v1/app/updates/download/:filename
     * Streams a specific APK version by filename.
     * Filename is validated against database release records to prevent path traversal.
     */
    fastify.get('/updates/download/:filename', {
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
    }, async (request, reply) => {
        const { filename } = request.params;
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
    });
    // ==========================================
    // AUTHENTICATED MANAGEMENT ENDPOINTS
    // ==========================================
    fastify.register(async (adminRouter) => {
        adminRouter.addHook('preHandler', authenticate);
        /**
         * GET /api/v1/app/updates
         * List all releases (draft, published, archived).
         */
        adminRouter.get('/updates', {
            preHandler: [requirePermission('app_updates.view')],
            schema: {
                description: 'List all application releases',
                tags: ['App Updates'],
                security: [{ bearerAuth: [] }],
            },
        }, async (_request, reply) => {
            const releases = await AppUpdateService.listReleases();
            return reply.send(successResponse(releases, 'Application releases retrieved'));
        });
        /**
         * GET /api/v1/app/updates/:id
         * Retrieve a specific release record.
         */
        adminRouter.get('/updates/:id', {
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
        }, async (request, reply) => {
            const { id } = request.params;
            const release = await AppUpdateService.getReleaseById(id);
            if (!release) {
                return reply.status(404).send(errorResponse('NOT_FOUND', 'Release not found'));
            }
            return reply.send(successResponse(release, 'Release details retrieved'));
        });
        /**
         * POST /api/v1/app/updates/upload
         * Upload an APK file with multipart form data.
         * Validates package, extracts versionName/versionCode, and creates draft release.
         */
        adminRouter.post('/updates/upload', {
            preHandler: [requirePermission('app_updates.upload')],
            schema: {
                description: 'Upload an APK package to create a draft release',
                tags: ['App Updates'],
                security: [{ bearerAuth: [] }],
            },
        }, async (request, reply) => {
            const user = request.user;
            // Handle multipart data
            if (typeof request.file !== 'function') {
                return reply.status(503).send(errorResponse('SERVICE_UNAVAILABLE', '@fastify/multipart is not installed on this server. Run "npm install" on the server to enable uploads.'));
            }
            const data = await request.file();
            if (!data) {
                return reply.status(400).send(errorResponse('BAD_REQUEST', 'No APK file uploaded. Use field name "apk" or "file".'));
            }
            const originalName = data.filename || '';
            if (!originalName.toLowerCase().endsWith('.apk')) {
                return reply.status(400).send(errorResponse('INVALID_FILE_TYPE', 'Only .apk files are supported'));
            }
            // Create staging file directly inside storage directory for zero-copy atomic rename
            const stagingFilePath = AppUpdateService.createStagingFilePath(originalName);
            try {
                // Concurrently compute SHA-256 and total bytes in-flight while streaming from client
                const hash = crypto.createHash('sha256');
                let uploadedBytes = 0;
                const hashTransform = new Transform({
                    transform(chunk, _encoding, callback) {
                        hash.update(chunk);
                        uploadedBytes += chunk.length;
                        callback(null, chunk);
                    },
                });
                // 2MB highWaterMark buffer to maximize disk write throughput
                const writeStream = fs.createWriteStream(stagingFilePath, { highWaterMark: 2 * 1024 * 1024 });
                await pipeline(data.file, hashTransform, writeStream);
                const computedSha256 = hash.digest('hex');
                // Extract non-file fields if provided
                const fields = data.fields;
                let releaseNotes;
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
                // Create draft release with instant atomic rename & precomputed hash/size
                const draft = await AppUpdateService.createDraftRelease({
                    tempFilePath: stagingFilePath,
                    precomputedSha256: computedSha256,
                    precomputedSize: uploadedBytes,
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
            }
            catch (err) {
                // Clean up staging file if still present
                if (fs.existsSync(stagingFilePath)) {
                    try {
                        await fs.promises.unlink(stagingFilePath);
                    }
                    catch (_) { }
                }
                logger.error({ err }, '[APK_UPLOAD] Upload or validation error');
                return reply.status(400).send(errorResponse('VALIDATION_FAILED', err?.message || 'Failed to process and validate uploaded APK.'));
            }
        });
        /**
         * POST /api/v1/app/updates/:id/publish
         * Atomically publishes the specified draft release.
         */
        adminRouter.post('/updates/:id/publish', {
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
        }, async (request, reply) => {
            const { id } = request.params;
            const user = request.user;
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
            }
            catch (err) {
                logger.error({ err, releaseId: id }, '[APK_PUBLISH] Failed to publish release');
                return reply.status(400).send(errorResponse('PUBLISH_FAILED', err?.message || 'Failed to publish release'));
            }
        });
        /**
         * POST /api/v1/app/updates/:id/archive
         * Mark a release as archived.
         */
        adminRouter.post('/updates/:id/archive', {
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
        }, async (request, reply) => {
            const { id } = request.params;
            const user = request.user;
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
            }
            catch (err) {
                return reply.status(400).send(errorResponse('ARCHIVE_FAILED', err?.message || 'Failed to archive release'));
            }
        });
        /**
         * DELETE /api/v1/app/updates/:id
         * Delete a release record (and file if unreferenced).
         */
        adminRouter.delete('/updates/:id', {
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
        }, async (request, reply) => {
            const { id } = request.params;
            const user = request.user;
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
            }
            catch (err) {
                return reply.status(400).send(errorResponse('DELETE_FAILED', err?.message || 'Failed to delete release'));
            }
        });
    });
};
//# sourceMappingURL=routes.js.map