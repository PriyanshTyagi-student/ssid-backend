import type { AuditActionType } from '../../config/constants.js';
export interface AuditParams {
    userId?: string;
    action: AuditActionType;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}
export declare function recordAudit(params: AuditParams): Promise<void>;
