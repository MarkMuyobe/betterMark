/**
 * AuthProvider - V14 Token management component.
 *
 * Wraps the application with authentication context and
 * handles automatic token refresh.
 */

'use client';

import { useEffect, ReactNode } from 'react';
import { AuthProvider as AuthContextProvider, useAuth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';

/**
 * Public routes that don't require authentication.
 */
const PUBLIC_ROUTES = ['/login'];

/**
 * Auth guard component.
 */
function AuthGuard({ children }: { children: ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isLoading && !isAuthenticated && !PUBLIC_ROUTES.includes(pathname)) {
            router.push('/login');
        }
    }, [isAuthenticated, isLoading, pathname, router]);

    // Show nothing while checking auth on protected routes
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    // Redirect to dashboard if logged in and on login page
    if (isAuthenticated && pathname === '/login') {
        router.push('/');
        return null;
    }

    // Allow access to public routes when not authenticated
    if (!isAuthenticated && PUBLIC_ROUTES.includes(pathname)) {
        return <>{children}</>;
    }

    // Block protected routes when not authenticated
    if (!isAuthenticated) {
        return null;
    }

    return <>{children}</>;
}

/**
 * Auto refresh component.
 * Refreshes the access token before it expires.
 */
function AutoRefresh() {
    const { isAuthenticated, refreshToken, tokens } = useAuth();

    useEffect(() => {
        if (!isAuthenticated || !tokens?.expiresIn) return;

        // Refresh 1 minute before expiry
        const refreshTime = Math.max((tokens.expiresIn - 60) * 1000, 60000);

        const timer = setInterval(() => {
            refreshToken();
        }, refreshTime);

        return () => clearInterval(timer);
    }, [isAuthenticated, refreshToken, tokens?.expiresIn]);

    return null;
}

/**
 * Root auth provider with all auth features.
 */
export function RootAuthProvider({ children }: { children: ReactNode }) {
    return (
        <AuthContextProvider>
            <AutoRefresh />
            <AuthGuard>{children}</AuthGuard>
        </AuthContextProvider>
    );
}
