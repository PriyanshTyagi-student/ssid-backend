export declare class AuthService {
    /**
     * Log in user with phone number and password.
     */
    static login(phone: string, passwordPlaintext: string, ipAddress?: string, userAgent?: string): Promise<{
        accessToken: string;
        token: string;
        user: {
            id: any;
            name: any;
            phone: any;
            role: any;
            permissions: string[];
            status: any;
            projectId: any;
            project_id: any;
            projectName: any;
            project_name: any;
            siteId: any;
            site_id: any;
            siteName: any;
            site_name: any;
            assignedProjects: any;
            assignedSites: any;
        };
    }>;
    /**
     * Resolve user permissions dynamically from roles table.
     * Administrators and roles with '*' bypass specific restrictions.
     */
    static getUserPermissions(userRole: string): Promise<string[]>;
    /**
     * Get user's assigned project and site details.
     */
    static getUserAssignments(userId: string): Promise<{
        assignedProjects: any;
        assignedSites: any;
        primaryProject: any;
        primaryProjectId: any;
        primarySite: any;
        primarySiteId: any;
    }>;
    /**
     * Log out user.
     */
    static logout(userId: string, ipAddress?: string, userAgent?: string): Promise<void>;
    /**
     * Change user password.
     */
    static changePassword(userId: string, currentPasswordPlaintext: string, newPasswordPlaintext: string, ipAddress?: string, userAgent?: string): Promise<void>;
    /**
     * Request password reset instructions.
     */
    static forgotPassword(phone: string, ipAddress?: string, userAgent?: string): Promise<string>;
    /**
     * Check if first-run administrator setup is required.
     */
    static getSetupStatus(): Promise<{
        isSetupRequired: boolean;
        totalUsers: number;
    }>;
    /**
     * Provision the initial administrator account on a fresh database.
     */
    static bootstrapAdmin(data: {
        name: string;
        phoneNumber: string;
        passwordPlaintext: string;
    }, ipAddress?: string, userAgent?: string): Promise<{
        token: string;
        user: {
            id: any;
            name: any;
            phoneNumber: any;
            phone_number: any;
            role: any;
            status: any;
            permissions: string[];
        };
    }>;
}
