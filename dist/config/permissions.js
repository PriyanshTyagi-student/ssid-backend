/**
 * Centralized Application Permission Registry
 *
 * Single source of truth for all granular permissions available in the system.
 * Categorized by domain modules with human-readable labels and descriptions.
 */
export const PERMISSION_REGISTRY = [
    {
        module: 'Reports',
        description: 'Daily construction site logs and trade attendance',
        permissions: [
            { id: 'reports.view', label: 'View Reports', description: 'Browse and inspect submitted daily site reports' },
            { id: 'reports.create', label: 'Create Reports', description: 'Author and submit new daily draft reports' },
            { id: 'reports.edit', label: 'Edit Reports', description: 'Modify draft and existing site report details' },
            { id: 'reports.review', label: 'Review Reports', description: 'Move reports into Under Review state' },
            { id: 'reports.approve', label: 'Approve Reports', description: 'Grant final sign-off and approval to daily reports' },
            { id: 'reports.reject', label: 'Reject Reports', description: 'Reject daily reports with mandatory rejection feedback' },
            { id: 'reports.delete', label: 'Delete Reports', description: 'Permanently remove daily site reports from system' },
            { id: 'reports.export', label: 'Export Reports', description: 'Export daily site logs to Excel or CSV formats' },
        ],
    },
    {
        module: 'Projects',
        description: 'Construction projects, master records, and client metadata',
        permissions: [
            { id: 'projects.view', label: 'View Projects', description: 'Browse construction projects directory and details' },
            { id: 'projects.create', label: 'Create Projects', description: 'Create new construction project master records' },
            { id: 'projects.edit', label: 'Edit Projects', description: 'Update project timelines, status, and metadata' },
            { id: 'projects.delete', label: 'Delete Projects', description: 'Archive or permanently remove project records' },
        ],
    },
    {
        module: 'Sites',
        description: 'Job sites, tower blocks, and geographical work zones',
        permissions: [
            { id: 'sites.view', label: 'View Sites', description: 'Browse job sites directory and site specifications' },
            { id: 'sites.create', label: 'Create Sites', description: 'Add new job sites and work zones to projects' },
            { id: 'sites.edit', label: 'Edit Sites', description: 'Update site names, locations, descriptions, and statuses' },
            { id: 'sites.delete', label: 'Delete Sites', description: 'Remove or archive job sites' },
        ],
    },
    {
        module: 'Users & Team',
        description: 'User accounts, credentials, and access statuses',
        permissions: [
            { id: 'users.view', label: 'View Users', description: 'View staff directory, profiles, and assignment records' },
            { id: 'users.create', label: 'Create Users', description: 'Provision new user accounts and credentials' },
            { id: 'users.edit', label: 'Edit Users', description: 'Update user profiles, contact details, and account status' },
            { id: 'users.delete', label: 'Delete Users', description: 'Deactivate or permanently delete user accounts' },
            { id: 'users.assign_role', label: 'Assign Roles', description: 'Change user role and security authorization profiles' },
        ],
    },
    {
        module: 'Roles & Permissions',
        description: 'Security profiles, authority tiers, and capability grants',
        permissions: [
            { id: 'roles.view', label: 'View Roles', description: 'Browse configured roles, authority levels, and permissions' },
            { id: 'roles.create', label: 'Create Roles', description: 'Author custom security roles and grant granular capabilities' },
            { id: 'roles.edit', label: 'Edit Roles', description: 'Update role names, descriptions, and capability sets' },
            { id: 'roles.delete', label: 'Delete Roles', description: 'Delete unassigned custom roles' },
        ],
    },
    {
        module: 'Assignments',
        description: 'Project and site staffing allocations',
        permissions: [
            { id: 'assignments.view', label: 'View Assignments', description: 'Inspect user project and site assignment matrix' },
            { id: 'assignments.manage', label: 'Manage Assignments', description: 'Allocate or remove staff from projects and job sites' },
        ],
    },
    {
        module: 'Labor Categories',
        description: 'Trade classifications and labor rate masters',
        permissions: [
            { id: 'labor_categories.view', label: 'View Categories', description: 'Inspect trade classifications and labor rates' },
            { id: 'labor_categories.create', label: 'Create Categories', description: 'Create new trade classifications and worker categories' },
            { id: 'labor_categories.edit', label: 'Edit Categories', description: 'Modify or rename trade classifications and categories' },
            { id: 'labor_categories.delete', label: 'Delete Categories', description: 'Delete classifications and trade categories' },
        ],
    },
    {
        module: 'App Releases',
        description: 'Android APK binaries, distribution, and in-app update management',
        permissions: [
            { id: 'app_updates.view', label: 'View Releases', description: 'Inspect application version history and APK releases' },
            { id: 'app_updates.upload', label: 'Upload APK', description: 'Upload and inspect new Android APK binaries' },
            { id: 'app_updates.publish', label: 'Publish Release', description: 'Mark an APK release as active for mobile distribution' },
            { id: 'app_updates.delete', label: 'Delete Release', description: 'Permanently remove draft or archived APK releases' },
        ],
    },
    {
        module: 'System & Audits',
        description: 'Security audit logs, system telemetry, and platform configuration',
        permissions: [
            { id: 'audit.view', label: 'View Audit Logs', description: 'Browse and inspect platform security audit trails' },
            { id: 'settings.view', label: 'View Settings', description: 'Access platform settings and operational telemetry' },
        ],
    },
];
/**
 * Flat set of all valid permission strings in the system
 */
export const ALL_VALID_PERMISSIONS = new Set(PERMISSION_REGISTRY.flatMap((group) => group.permissions.map((p) => p.id)));
/**
 * Validate whether a given permission string exists in the system registry or is wildcard
 */
export function isValidPermission(permission) {
    if (permission === '*' || permission === 'admin')
        return true;
    if (ALL_VALID_PERMISSIONS.has(permission))
        return true;
    // Module-level wildcard, e.g. 'reports.*'
    if (permission.endsWith('.*')) {
        const mod = permission.slice(0, -2);
        return PERMISSION_REGISTRY.some((g) => g.permissions.some((p) => p.id.startsWith(`${mod}.`)));
    }
    return false;
}
/**
 * Evaluates whether a set of user permissions satisfies a required permission.
 * Supports:
 * - Super-admin wildcard: '*' or 'admin'
 * - Module wildcard: 'reports.*' satisfies 'reports.view', 'reports.create', etc.
 * - Granular hierarchy: '<module>.manage' satisfies '<module>.create', '<module>.edit', '<module>.delete', '<module>.view'
 * - Domain aliases:
 *     'labor.xxx' <-> 'labor_categories.xxx'
 *     'audit.view' <-> 'settings.view'
 */
export function hasPermission(userPermissions, required) {
    if (!userPermissions || !Array.isArray(userPermissions) || userPermissions.length === 0) {
        return false;
    }
    // 1. Super-admin wildcard
    if (userPermissions.includes('*') || userPermissions.includes('admin')) {
        return true;
    }
    // 2. Direct exact match
    if (userPermissions.includes(required)) {
        return true;
    }
    // 3. Module wildcard match (e.g. 'reports.*' satisfies 'reports.view')
    const [mod, action] = required.split('.');
    if (mod && userPermissions.includes(`${mod}.*`)) {
        return true;
    }
    // 4. Hierarchical .manage mapping
    if (action && userPermissions.includes(`${mod}.manage`)) {
        return true;
    }
    // 5. Domain Aliases
    // labor <-> labor_categories
    if (mod === 'labor' || mod === 'labor_categories') {
        const altMod = mod === 'labor' ? 'labor_categories' : 'labor';
        if (userPermissions.includes(`${altMod}.${action}`))
            return true;
        if (userPermissions.includes(`${altMod}.manage`))
            return true;
        if (userPermissions.includes(`${altMod}.*`))
            return true;
    }
    // audit.view <-> settings.view
    if (required === 'audit.view' && userPermissions.includes('settings.view')) {
        return true;
    }
    if (required === 'settings.view' && userPermissions.includes('audit.view')) {
        return true;
    }
    return false;
}
/**
 * Evaluates whether user permissions satisfy ANY of the required permissions
 */
export function hasAnyPermission(userPermissions, required) {
    return required.some((perm) => hasPermission(userPermissions, perm));
}
/**
 * Evaluates whether user permissions satisfy ALL of the required permissions
 */
export function hasAllPermissions(userPermissions, required) {
    return required.every((perm) => hasPermission(userPermissions, perm));
}
//# sourceMappingURL=permissions.js.map