/**
 * usePermissions - V14 Role-based permissions hook.
 *
 * Provides permission checks for UI elements based on user role.
 */

'use client';

import { useMemo } from 'react';
import { useAuth, UserRole } from '@/lib/auth';

/**
 * Permission definitions for each role.
 */
const ROLE_PERMISSIONS = {
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
} as const;

export type Permission = keyof typeof ROLE_PERMISSIONS.admin;

export interface PermissionsResult {
    /** Whether the user has read access */
    canRead: boolean;
    /** Whether the user can approve/reject suggestions */
    canApprove: boolean;
    /** Whether the user can perform rollbacks */
    canRollback: boolean;
    /** Whether the user can modify arbitrations */
    canModifyArbitrations: boolean;
    /** Check if user has a specific permission */
    hasPermission: (permission: Permission) => boolean;
    /** Check if user has a specific role */
    hasRole: (role: UserRole | UserRole[]) => boolean;
    /** Whether user is admin */
    isAdmin: boolean;
    /** Whether user is authenticated */
    isAuthenticated: boolean;
    /** Current user role */
    role: UserRole | undefined;
}

/**
 * Hook to access user permissions based on their role.
 *
 * @example
 * const { canApprove, canRollback } = usePermissions();
 *
 * return (
 *   <>
 *     {canApprove && <Button onClick={handleApprove}>Approve</Button>}
 *     {canRollback && <Button onClick={handleRollback}>Rollback</Button>}
 *   </>
 * );
 */
export function usePermissions(): PermissionsResult {
    const { user, isAuthenticated } = useAuth();
    const role = user?.role;

    const permissions = useMemo(() => {
        if (!role) {
            return {
                canRead: false,
                canApprove: false,
                canRollback: false,
                canModifyArbitrations: false,
            };
        }
        return ROLE_PERMISSIONS[role];
    }, [role]);

    const hasPermission = useMemo(
        () => (permission: Permission): boolean => {
            if (!role) return false;
            return ROLE_PERMISSIONS[role][permission] ?? false;
        },
        [role]
    );

    const hasRole = useMemo(
        () => (checkRole: UserRole | UserRole[]): boolean => {
            if (!role) return false;
            const roles = Array.isArray(checkRole) ? checkRole : [checkRole];
            return roles.includes(role);
        },
        [role]
    );

    return {
        ...permissions,
        hasPermission,
        hasRole,
        isAdmin: role === 'admin',
        isAuthenticated,
        role,
    };
}

/**
 * Higher-order component wrapper for permission-gated content.
 *
 * @example
 * <RequirePermission permission="canApprove" fallback={<DisabledButton />}>
 *   <ApproveButton />
 * </RequirePermission>
 */
export function RequirePermission({
    permission,
    role,
    fallback = null,
    children,
}: {
    permission?: Permission;
    role?: UserRole | UserRole[];
    fallback?: React.ReactNode;
    children: React.ReactNode;
}) {
    const { hasPermission, hasRole } = usePermissions();

    if (permission && !hasPermission(permission)) {
        return <>{fallback}</>;
    }

    if (role && !hasRole(role)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
