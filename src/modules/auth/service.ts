import { getDb } from '../../database/connection.js';
import { users } from '../../database/schema/users.js';
import { projects } from '../../database/schema/projects.js';
import { sites } from '../../database/schema/sites.js';
import { userProjectAssignments, userSiteAssignments } from '../../database/schema/assignments.js';
import { roles } from '../../database/schema/roles.js';
import { eq, asc, inArray, count } from 'drizzle-orm';
import { verifyPassword, hashPassword } from '../../utils/password.js';
import { generateToken } from '../../utils/jwt.js';
import { recordAudit } from '../audit/service.js';
import { AuditAction, UserStatus, UserRole, ProjectStatus, SiteStatus, type UserRoleType } from '../../config/constants.js';

export class AuthService {
  /**
   * Log in user with phone number and password.
   */
  static async login(
    phone: string,
    passwordPlaintext: string,
    ipAddress?: string,
    userAgent?: string
  ) {
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
      role: user.role as UserRoleType,
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
    const permissions = await AuthService.getUserPermissions(user.role);

    return {
      accessToken: token,
      token, // Also return as 'token' for mobile app compatibility
      user: {
        id: user.id,
        name: user.name,
        phone: user.phoneNumber,
        role: user.role,
        permissions,
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
   * Resolve user permissions from roles table or fallback defaults.
   */
  static async getUserPermissions(userRole: string): Promise<string[]> {
    const db = getDb();
    const [roleRecord] = await db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(eq(roles.slug, userRole))
      .limit(1);

    if (roleRecord && Array.isArray(roleRecord.permissions) && roleRecord.permissions.length > 0) {
      return roleRecord.permissions;
    }

    if (userRole === UserRole.ADMIN) {
      return [
        'reports.view', 'reports.create', 'reports.review', 'reports.approve', 'reports.reject',
        'reports.delete', 'reports.export', 'projects.view', 'projects.manage', 'sites.view',
        'sites.manage', 'users.view', 'users.manage', 'settings.view'
      ];
    }
    if (userRole === UserRole.PROJECT_MANAGER) {
      return [
        'reports.view', 'reports.create', 'reports.review', 'reports.approve', 'reports.reject',
        'reports.delete', 'reports.export', 'projects.view', 'projects.manage', 'sites.view',
        'sites.manage', 'settings.view'
      ];
    }
    if (userRole === UserRole.SITE_SUPERVISOR) {
      return ['reports.view', 'reports.create', 'reports.approve', 'projects.view', 'sites.view', 'settings.view'];
    }
    return ['reports.view', 'reports.create', 'projects.view', 'sites.view', 'settings.view'];
  }

  /**
   * Get user's assigned project and site details.
   */
  static async getUserAssignments(userId: string) {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    // Admins and Project Managers have universal access to all active projects and sites
    if (user?.role === UserRole.ADMIN || user?.role === UserRole.PROJECT_MANAGER) {
      const allProjects = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.status, ProjectStatus.ACTIVE))
        .orderBy(asc(projects.name));

      const allSites = await db
        .select({ id: sites.id, name: sites.name, projectId: sites.projectId })
        .from(sites)
        .where(eq(sites.status, SiteStatus.ACTIVE))
        .orderBy(asc(sites.name));

      return {
        assignedProjects: allProjects,
        assignedSites: allSites,
        primaryProject: allProjects[0]?.name ?? null,
        primaryProjectId: allProjects[0]?.id ?? null,
        primarySite: allSites[0]?.name ?? null,
        primarySiteId: allSites[0]?.id ?? null,
      };
    }

    // Explicitly assigned projects
    const assignedProjects = await db
      .select({ id: projects.id, name: projects.name })
      .from(userProjectAssignments)
      .innerJoin(projects, eq(userProjectAssignments.projectId, projects.id))
      .where(eq(userProjectAssignments.userId, userId))
      .orderBy(asc(projects.name));

    // Explicitly assigned sites
    const explicitSites = await db
      .select({ id: sites.id, name: sites.name, projectId: sites.projectId })
      .from(userSiteAssignments)
      .innerJoin(sites, eq(userSiteAssignments.siteId, sites.id))
      .where(eq(userSiteAssignments.userId, userId))
      .orderBy(asc(sites.name));

    // Also include active sites of assigned projects to ensure field engineers can report on their assigned projects' sites
    const projectIds = assignedProjects.map((p: any) => p.id);
    let projectSites: typeof explicitSites = [];
    if (projectIds.length > 0) {
      projectSites = await db
        .select({ id: sites.id, name: sites.name, projectId: sites.projectId })
        .from(sites)
        .where(inArray(sites.projectId, projectIds))
        .orderBy(asc(sites.name));
    }

    // Merge distinct sites
    const siteMap = new Map<string, typeof explicitSites[0]>();
    for (const s of explicitSites) {
      siteMap.set(s.id, s);
    }
    for (const s of projectSites) {
      if (!siteMap.has(s.id)) {
        siteMap.set(s.id, s);
      }
    }
    const combinedSites = Array.from(siteMap.values());

    return {
      assignedProjects,
      assignedSites: combinedSites,
      primaryProject: assignedProjects[0]?.name ?? null,
      primaryProjectId: assignedProjects[0]?.id ?? null,
      primarySite: combinedSites[0]?.name ?? null,
      primarySiteId: combinedSites[0]?.id ?? null,
    };
  }

  /**
   * Log out user.
   */
  static async logout(userId: string, ipAddress?: string, userAgent?: string) {
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
  static async changePassword(
    userId: string,
    currentPasswordPlaintext: string,
    newPasswordPlaintext: string,
    ipAddress?: string,
    userAgent?: string
  ) {
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
  static async forgotPassword(phone: string, ipAddress?: string, userAgent?: string) {
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

  /**
   * Check if first-run administrator setup is required.
   */
  static async getSetupStatus() {
    const db = getDb();
    const [res] = await db.select({ count: count() }).from(users);
    const userCount = Number(res?.count ?? 0);
    return {
      isSetupRequired: userCount === 0,
      totalUsers: userCount,
    };
  }

  /**
   * Provision the initial administrator account on a fresh database.
   */
  static async bootstrapAdmin(
    data: { name: string; phoneNumber: string; passwordPlaintext: string },
    ipAddress?: string,
    userAgent?: string
  ) {
    const db = getDb();
    const [res] = await db.select({ count: count() }).from(users);
    const userCount = Number(res?.count ?? 0);

    if (userCount > 0) {
      throw new Error('Initial setup has already been completed. Please log in with existing administrator credentials.');
    }

    const { name, phoneNumber, passwordPlaintext } = data;
    if (!name || name.trim().length < 2) {
      throw new Error('Administrator name must be at least 2 characters.');
    }
    if (!phoneNumber || phoneNumber.trim().length < 10) {
      throw new Error('Please provide a valid 10-digit phone number.');
    }
    if (!passwordPlaintext || passwordPlaintext.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    // Normalize phone number
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    const formattedPhone = digitsOnly.length === 10 ? `+91${digitsOnly}` : (phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`);

    // Ensure Admin role exists in roles table
    const [existingAdminRole] = await db.select().from(roles).where(eq(roles.slug, UserRole.ADMIN)).limit(1);
    if (!existingAdminRole) {
      await db.insert(roles).values({
        name: 'Administrator',
        slug: UserRole.ADMIN,
        description: 'Full system access, management, and audit visibility',
        permissions: [
          'reports.view', 'reports.create', 'reports.review', 'reports.approve', 'reports.reject',
          'reports.delete', 'reports.export', 'projects.view', 'projects.manage', 'sites.view',
          'sites.manage', 'users.view', 'users.manage', 'settings.view'
        ],
        isSystem: false,
      });
    }

    const passwordHash = await hashPassword(passwordPlaintext);

    const [newUser] = await db
      .insert(users)
      .values({
        name: name.trim(),
        phoneNumber: formattedPhone,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      })
      .returning();

    const permissions = await AuthService.getUserPermissions(UserRole.ADMIN);
    const token = generateToken({
      userId: newUser.id,
      phone: newUser.phoneNumber,
      role: newUser.role as UserRoleType,
      name: newUser.name,
    });

    await recordAudit({
      userId: newUser.id,
      action: AuditAction.USER_CREATED,
      entityType: 'user',
      entityId: newUser.id,
      metadata: { setup: 'bootstrap_initial_admin', name: newUser.name, phone: newUser.phoneNumber },
      ipAddress,
      userAgent,
    });

    return {
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        phoneNumber: newUser.phoneNumber,
        phone_number: newUser.phoneNumber,
        role: newUser.role,
        status: newUser.status,
        permissions,
      },
    };
  }
}
