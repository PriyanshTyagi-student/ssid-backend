import { getDb } from '../../database/connection.js';
import { auditLogs } from '../../database/schema/audit.js';
import { logger } from '../../utils/logger.js';
export async function recordAudit(params) {
    try {
        const db = getDb();
        // Sanitize metadata to ensure no passwords or secrets are recorded
        const sanitizedMetadata = { ...params.metadata };
        delete sanitizedMetadata.password;
        delete sanitizedMetadata.passwordHash;
        delete sanitizedMetadata.token;
        delete sanitizedMetadata.accessToken;
        delete sanitizedMetadata.refreshToken;
        await db.insert(auditLogs).values({
            userId: params.userId,
            action: params.action,
            entityType: params.entityType,
            entityId: params.entityId,
            metadata: sanitizedMetadata,
            ipAddress: params.ipAddress,
            userAgent: params.userAgent,
        });
        logger.debug(`[AUDIT] ${params.action} on ${params.entityType} ${params.entityId || ''}`);
    }
    catch (err) {
        logger.error({ err }, '[AUDIT] Failed to write audit log entry');
    }
}
//# sourceMappingURL=service.js.map