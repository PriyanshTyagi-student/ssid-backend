/**
 * Centralized Application Permission Registry
 *
 * Single source of truth for all granular permissions available in the system.
 * Categorized by domain modules with human-readable labels and descriptions.
 */
export interface PermissionDefinition {
    id: string;
    label: string;
    description: string;
}
export interface PermissionModule {
    module: string;
    description: string;
    permissions: PermissionDefinition[];
}
export declare const PERMISSION_REGISTRY: PermissionModule[];
/**
 * Flat set of all valid permission strings in the system
 */
export declare const ALL_VALID_PERMISSIONS: Set<string>;
/**
 * Validate whether a given permission string exists in the system registry or is wildcard
 */
export declare function isValidPermission(permission: string): boolean;
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
export declare function hasPermission(userPermissions: string[] | undefined | null, required: string): boolean;
/**
 * Evaluates whether user permissions satisfy ANY of the required permissions
 */
export declare function hasAnyPermission(userPermissions: string[] | undefined | null, required: string[]): boolean;
/**
 * Evaluates whether user permissions satisfy ALL of the required permissions
 */
export declare function hasAllPermissions(userPermissions: string[] | undefined | null, required: string[]): boolean;
