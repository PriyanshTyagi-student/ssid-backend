import { getDb } from '../../database/connection.js';
import { users } from '../../database/schema/users.js';
import { projects } from '../../database/schema/projects.js';
import { sites } from '../../database/schema/sites.js';
import { userProjectAssignments, userSiteAssignments } from '../../database/schema/assignments.js';
import { eq } from 'drizzle-orm';
import { verifyPassword, hashPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction, UserStatus } from '../../config/constants.js';
export class AuthService {
    /**
     * Log in user with phone number and password.
     */
    static async login(phone, passwordPlaintext, ipAddress, userAgent) {
        const db = getDb();
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.phoneNumber, phone))
            .limit(1);
        if (!user) {
            await recordAudit({
                action: AuditAction.USER_LOGIN_FAILED,
                entityType: 'user',
                metadata: { phone, reason: 'user_not_found' },
                ipAddress,
                userAgent,
            });
            throw new Error('Invalid phone number or password');
        }
        if (user.status !== UserStatus.ACTIVE) {
            await recordAudit({
                userId: user.id,
                action: AuditAction.USER_LOGIN_FAILED,
                entityType: 'user',
                entityId: user.id,
                metadata: { reason: 'account_disabled' },
                ipAddress,
                userAgent,
            });
            throw new Error('Your account has been disabled. Please contact your administrator.');
        }
        const isValid = await verifyPassword(user.passwordHash, passwordPlaintext);
        if (!isValid) {
            await recordAudit({
                userId: user.id,
                action: AuditAction.USER_LOGIN_FAILED,
                entityType: 'user',
                entityId: user.id,
                metadata: { reason: 'invalid_password' },
                ipAddress,
                userAgent,
            });
            throw new Error('Invalid phone number or password');
        }
        // Update lastLoginAt
        await db
            .update(users)
            .set({ lastLoginAt: new Date(), updatedAt: new Date() })
            .where(eq(users.id, user.id));
        // Generate JWT
        const token = generateToken({
            userId: user.id,
            phone: user.phoneNumber,
            role: user.role,
            name: user.name,
        });
        await recordAudit({
            userId: user.id,
            action: AuditAction.USER_LOGIN,
            entityType: 'user',
            entityId: user.id,
            ipAddress,
            userAgent,
        });
        const assignments = await AuthService.getUserAssignments(user.id);
        return {
            accessToken: token,
            token, // Also return as 'token' for mobile app compatibility
            user: {
                id: user.id,
                name: user.name,
                phone: user.phoneNumber,
                role: user.role,
                status: user.status,
                projectId: assignments.primaryProjectId,
                project_id: assignments.primaryProjectId,
                projectName: assignments.primaryProject,
                project_name: assignments.primaryProject,
                siteId: assignments.primarySiteId,
                site_id: assignments.primarySiteId,
                siteName: assignments.primarySite,
                site_name: assignments.primarySite,
                assignedProjects: assignments.assignedProjects,
                assignedSites: assignments.assignedSites,
            },
        };
    }
    /**
     * Get user's assigned project and site details.
     */
    static async getUserAssignments(userId) {
        const db = getDb();
        const assignedProjects = await db
            .select({ id: projects.id, name: projects.name })
            .from(userProjectAssignments)
            .innerJoin(projects, eq(userProjectAssignments.projectId, projects.id))
            .where(eq(userProjectAssignments.userId, userId));
        const assignedSites = await db
            .select({ id: sites.id, name: sites.name, projectId: sites.projectId })
            .from(userSiteAssignments)
            .innerJoin(sites, eq(userSiteAssignments.siteId, sites.id))
            .where(eq(userSiteAssignments.userId, userId));
        return {
            assignedProjects,
            assignedSites,
            primaryProject: assignedProjects[0]?.name ?? null,
            primaryProjectId: assignedProjects[0]?.id ?? null,
            primarySite: assignedSites[0]?.name ?? null,
            primarySiteId: assignedSites[0]?.id ?? null,
        };
    }
    /**
     * Log out user.
     */
    static async logout(userId, ipAddress, userAgent) {
        await recordAudit({
            userId,
            action: AuditAction.USER_LOGOUT,
            entityType: 'user',
            entityId: userId,
            ipAddress,
            userAgent,
        });
    }
    /**
     * Change user password.
     */
    static async changePassword(userId, currentPasswordPlaintext, newPasswordPlaintext, ipAddress, userAgent) {
        const db = getDb();
        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) {
            throw new Error('User not found');
        }
        const isCurrentValid = await verifyPassword(user.passwordHash, currentPasswordPlaintext);
        if (!isCurrentValid) {
            throw new Error('Current password does not match');
        }
        const newHash = await hashPassword(newPasswordPlaintext);
        await db
            .update(users)
            .set({ passwordHash: newHash, updatedAt: new Date() })
            .where(eq(users.id, userId));
        await recordAudit({
            userId,
            action: AuditAction.PASSWORD_CHANGED,
            entityType: 'user',
            entityId: userId,
            ipAddress,
            userAgent,
        });
    }
    /**
     * Request password reset instructions.
     */
    static async forgotPassword(phone, ipAddress, userAgent) {
        const db = getDb();
        const [user] = await db.select().from(users).where(eq(users.phoneNumber, phone)).limit(1);
        if (user) {
            await recordAudit({
                userId: user.id,
                action: AuditAction.USER_UPDATED,
                entityType: 'user',
                entityId: user.id,
                metadata: { action: 'forgot_password_requested' },
                ipAddress,
                userAgent,
            });
        }
        // Always return success message to prevent user enumeration
        return 'Password reset instructions have been dispatched to the registered phone number.';
    }
}
//# sourceMappingURL=service.js.map