/**
 * RoleGuard - V14 Role-based authorization middleware.
 *
 * Controls access to endpoints based on user roles.
 */

import { ServerResponse } from 'http';
import { RequestContext, UserContext } from '../../infrastructure/observability/RequestContext.js';
import { ApiError } from '../../shared/errors/ApiError.js';
import { sendApiError } from '../../shared/errors/ErrorNormalizer.js';

/**
 * User roles.
 */
export type Role = 'admin' | 'operator' | 'auditor';

/**
 * Role permissions.
 */
export interface RolePermissions {
    /** Can read all data */
    canRead: boolean;
    /** Can approve/reject suggestions */
    canApprove: boolean;
    /** Can perform rollback operations */
    canRollback: boolean;
    /** Can modify arbitration decisions */
    canModifyArbitrations: boolean;
}

/**
 * Role permission definitions.
 */
export const ROLE_PERMISSIONS: Record<Role, RolePermissions> = {
    admin: {
        canRead: true,
        canApprove: true,
        canRollback: true,
        canModifyArbitrations: true,
    },
    operator: {
        canRead: true,
        canApprove: true,
        canRollback: false,
        canModifyArbitrations: false,
    },
    auditor: {
        canRead: true,
        canApprove: false,
        canRollback: false,
        canModifyArbitrations: false,
    },
};

/**
 * Permission type for authorization checks.
 */
export type Permission = keyof RolePermissions;

/**
 * Role guard class.
 */
export class RoleGuard {
    /**
     * Check if user has a specific permission.
     */
    static hasPermission(user: UserContext | undefined, permission: Permission): boolean {
        if (!user) return false;
        const permissions = ROLE_PERMISSIONS[user.role];
        return permissions?.[permission] ?? false;
    }

    /**
     * Check if user has one of the required roles.
     */
    static hasRole(user: UserContext | undefined, roles: Role[]): boolean {
        if (!user) return false;
        return roles.includes(user.role);
    }

    /**
     * Require specific permission.
     * Throws ApiError.forbidden if not authorized.
     */
    static requirePermission(permission: Permission): void {
        const user = RequestContext.getUser();
        if (!RoleGuard.hasPermission(user, permission)) {
            throw ApiError.forbidden(`Permission '${permission}' required`);
        }
    }

    /**
     * Require one of the specified roles.
     * Throws ApiError.forbidden if not authorized.
     */
    static requireRole(...roles: Role[]): void {
        const user = RequestContext.getUser();
        if (!RoleGuard.hasRole(user, roles)) {
            throw ApiError.forbidden(`One of roles [${roles.join(', ')}] required`);
        }
    }

    /**
     * Create a permission guard function.
     * Returns true if authorized, false if response was sent.
     */
    static guardPermission(res: ServerResponse, permission: Permission): boolean {
        try {
            RoleGuard.requirePermission(permission);
            return true;
        } catch (error) {
            if (error instanceof ApiError) {
                const correlationId = RequestContext.getCorrelationId();
                sendApiError(res, error, correlationId);
            }
            return false;
        }
    }

    /**
     * Create a role guard function.
     * Returns true if authorized, false if response was sent.
     */
    static guardRole(res: ServerResponse, ...roles: Role[]): boolean {
        try {
            RoleGuard.requireRole(...roles);
            return true;
        } catch (error) {
            if (error instanceof ApiError) {
                const correlationId = RequestContext.getCorrelationId();
                sendApiError(res, error, correlationId);
            }
            return false;
        }
    }

    /**
     * Get current user's permissions.
     */
    static getCurrentPermissions(): RolePermissions | null {
        const user = RequestContext.getUser();
        if (!user) return null;
        return ROLE_PERMISSIONS[user.role] ?? null;
    }

    /**
     * Check if current user can perform a rollback.
     */
    static canRollback(): boolean {
        const user = RequestContext.getUser();
        return RoleGuard.hasPermission(user, 'canRollback');
    }

    /**
     * Check if current user can approve/reject.
     */
    static canApprove(): boolean {
        const user = RequestContext.getUser();
        return RoleGuard.hasPermission(user, 'canApprove');
    }

    /**
     * Check if current user is admin.
     */
    static isAdmin(): boolean {
        const user = RequestContext.getUser();
        return user?.role === 'admin';
    }
}

/**
 * Route authorization rules.
 * Maps route patterns to required permissions.
 */
export interface RouteAuthRule {
    pattern: RegExp;
    method: string | string[];
    permission?: Permission;
    roles?: Role[];
}

/**
 * Admin route authorization rules.
 */
export const ADMIN_ROUTE_RULES: RouteAuthRule[] = [
    // Read operations - all authenticated users
    { pattern: /^\/admin\/preferences$/, method: 'GET', permission: 'canRead' },
    { pattern: /^\/admin\/suggestions$/, method: 'GET', permission: 'canRead' },
    { pattern: /^\/admin\/arbitrations$/, method: 'GET', permission: 'canRead' },
    { pattern: /^\/admin\/escalations\/pending$/, method: 'GET', permission: 'canRead' },
    { pattern: /^\/admin\/audit/, method: 'GET', permission: 'canRead' },
    { pattern: /^\/admin\/explanations\//, method: 'GET', permission: 'canRead' },

    // Approve/reject - operator and admin
    { pattern: /^\/admin\/suggestions\/[^/]+\/approve$/, method: 'POST', permission: 'canApprove' },
    { pattern: /^\/admin\/suggestions\/[^/]+\/reject$/, method: 'POST', permission: 'canApprove' },
    { pattern: /^\/admin\/escalations\/[^/]+\/approve$/, method: 'POST', permission: 'canApprove' },
    { pattern: /^\/admin\/escalations\/[^/]+\/reject$/, method: 'POST', permission: 'canApprove' },

    // Rollback - admin only
    { pattern: /^\/admin\/preferences\/rollback$/, method: 'POST', permission: 'canRollback' },
    { pattern: /^\/admin\/arbitrations\/[^/]+\/rollback$/, method: 'POST', permission: 'canRollback' },
];

/**
 * Check if a request is authorized based on route rules.
 */
export function checkRouteAuthorization(route: string, method: string): boolean {
    const rule = ADMIN_ROUTE_RULES.find(r => {
        const methodMatch = Array.isArray(r.method)
            ? r.method.includes(method)
            : r.method === method;
        return methodMatch && r.pattern.test(route);
    });

    // If no rule matches, allow by default (authentication still required)
    if (!rule) return true;

    const user = RequestContext.getUser();

    if (rule.permission) {
        return RoleGuard.hasPermission(user, rule.permission);
    }

    if (rule.roles) {
        return RoleGuard.hasRole(user, rule.roles);
    }

    return true;
}
