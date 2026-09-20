import { AuthService } from './service.js';
import { loginSchema, forgotPasswordSchema, changePasswordSchema } from './schema.js';
import { successResponse, errorResponse } from '../../utils/response.js';
export class AuthController {
    static async login(request, reply) {
        const input = loginSchema.parse(request.body);
        try {
            const result = await AuthService.login(input.phone, input.password, request.ip, request.headers['user-agent']);
            return reply.send({
                success: true,
                accessToken: result.accessToken,
                token: result.token,
                user: result.user,
                data: result,
                message: 'Login successful',
            });
        }
        catch (err) {
            return reply.status(401).send(errorResponse('AUTHENTICATION_FAILED', err.message));
        }
    }
    static async logout(request, reply) {
        if (request.user) {
            await AuthService.logout(request.user.id, request.ip, request.headers['user-agent']);
        }
        return reply.send(successResponse(null, 'Logged out successfully'));
    }
    static async me(request, reply) {
        if (!request.user) {
            return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Not authenticated'));
        }
        const assignments = await AuthService.getUserAssignments(request.user.id);
        const permissions = await AuthService.getUserPermissions(request.user.role);
        const user = {
            id: request.user.id,
            name: request.user.name,
            phone: request.user.phoneNumber,
            role: request.user.role,
            permissions,
            status: request.user.status,
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
            createdAt: request.user.createdAt,
            lastLoginAt: request.user.lastLoginAt,
        };
        return reply.send(successResponse({ user }, 'User session active'));
    }
    static async forgotPassword(request, reply) {
        const input = forgotPasswordSchema.parse(request.body);
        const message = await AuthService.forgotPassword(input.phone, request.ip, request.headers['user-agent']);
        return reply.send(successResponse(null, message));
    }
    static async changePassword(request, reply) {
        if (!request.user) {
            return reply.status(401).send(errorResponse('UNAUTHORIZED', 'Not authenticated'));
        }
        const input = changePasswordSchema.parse(request.body);
        try {
            await AuthService.changePassword(request.user.id, input.currentPassword, input.newPassword, request.ip, request.headers['user-agent']);
            return reply.send(successResponse(null, 'Password changed successfully'));
        }
        catch (err) {
            return reply.status(400).send(errorResponse('BAD_REQUEST', err.message));
        }
    }
}
//# sourceMappingURL=controller.js.map