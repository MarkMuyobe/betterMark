/**
 * Auth - V14 Authentication context and hooks.
 *
 * Provides JWT-based authentication for the admin UI.
 */

'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

/**
 * User role type.
 */
export type UserRole = 'admin' | 'operator' | 'auditor';

/**
 * Authenticated user information.
 */
export interface AuthUser {
    userId: string;
    role: UserRole;
}

/**
 * Auth tokens.
 */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

/**
 * Auth state.
 */
export interface AuthState {
    user: AuthUser | null;
    tokens: AuthTokens | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
}

/**
 * Auth context value.
 */
export interface AuthContextValue extends AuthState {
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<boolean>;
    getAccessToken: () => string | null;
    canApprove: () => boolean;
    canRollback: () => boolean;
    isAdmin: () => boolean;
}

/**
 * Default auth state.
 */
const defaultAuthState: AuthState = {
    user: null,
    tokens: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
};

/**
 * Storage keys.
 */
const STORAGE_KEYS = {
    ACCESS_TOKEN: 'admin_access_token',
    REFRESH_TOKEN: 'admin_refresh_token',
    USER: 'admin_user',
} as const;

/**
 * Parse JWT payload (without verification).
 */
function parseJwtPayload(token: string): { sub: string; role: UserRole; exp: number } | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return payload;
    } catch {
        return null;
    }
}

/**
 * Check if token is expired.
 */
function isTokenExpired(token: string): boolean {
    const payload = parseJwtPayload(token);
    if (!payload) return true;
    // Add 30 second buffer
    return payload.exp * 1000 < Date.now() + 30000;
}

/**
 * Create auth context.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth provider props.
 */
export interface AuthProviderProps {
    children: ReactNode;
}

/**
 * Auth provider component.
 */
export function AuthProvider({ children }: AuthProviderProps) {
    const [state, setState] = useState<AuthState>(defaultAuthState);

    // Load tokens from storage on mount
    useEffect(() => {
        const loadStoredAuth = () => {
            try {
                const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
                const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
                const userJson = localStorage.getItem(STORAGE_KEYS.USER);

                if (accessToken && refreshToken && userJson) {
                    const user = JSON.parse(userJson) as AuthUser;

                    // Check if access token is expired
                    if (isTokenExpired(accessToken)) {
                        // Token expired, we'll refresh it
                        setState(prev => ({ ...prev, isLoading: false }));
                        return;
                    }

                    setState({
                        user,
                        tokens: { accessToken, refreshToken, expiresIn: 0 },
                        isAuthenticated: true,
                        isLoading: false,
                        error: null,
                    });
                } else {
                    setState(prev => ({ ...prev, isLoading: false }));
                }
            } catch {
                setState(prev => ({ ...prev, isLoading: false }));
            }
        };

        loadStoredAuth();
    }, []);

    // Login function
    const login = useCallback(async (username: string, password: string): Promise<boolean> => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const response = await fetch(`${API_BASE_URL}/admin/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            const result = await response.json();

            if (!response.ok) {
                const errorMessage = result.error?.message || 'Login failed';
                setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
                return false;
            }

            const { accessToken, refreshToken, expiresIn } = result.data;
            const payload = parseJwtPayload(accessToken);

            if (!payload) {
                setState(prev => ({ ...prev, isLoading: false, error: 'Invalid token received' }));
                return false;
            }

            const user: AuthUser = {
                userId: payload.sub,
                role: payload.role,
            };

            // Store in localStorage
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
            localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

            setState({
                user,
                tokens: { accessToken, refreshToken, expiresIn },
                isAuthenticated: true,
                isLoading: false,
                error: null,
            });

            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Login failed';
            setState(prev => ({ ...prev, isLoading: false, error: message }));
            return false;
        }
    }, []);

    // Logout function
    const logout = useCallback(async (): Promise<void> => {
        try {
            const refreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
            const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);

            if (accessToken) {
                await fetch(`${API_BASE_URL}/admin/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({ refreshToken }),
                }).catch(() => { /* Ignore logout failures */ });
            }
        } finally {
            // Clear storage and state regardless of API call result
            localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
            localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
            localStorage.removeItem(STORAGE_KEYS.USER);

            setState({
                ...defaultAuthState,
                isLoading: false,
            });
        }
    }, []);

    // Refresh token function
    const refreshTokenFn = useCallback(async (): Promise<boolean> => {
        const currentRefreshToken = localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
        if (!currentRefreshToken) return false;

        try {
            const response = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: currentRefreshToken }),
            });

            if (!response.ok) {
                await logout();
                return false;
            }

            const result = await response.json();
            const { accessToken, refreshToken, expiresIn } = result.data;
            const payload = parseJwtPayload(accessToken);

            if (!payload) {
                await logout();
                return false;
            }

            const user: AuthUser = {
                userId: payload.sub,
                role: payload.role,
            };

            // Update storage
            localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
            localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
            localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));

            setState({
                user,
                tokens: { accessToken, refreshToken, expiresIn },
                isAuthenticated: true,
                isLoading: false,
                error: null,
            });

            return true;
        } catch {
            await logout();
            return false;
        }
    }, [logout]);

    // Get access token (refresh if needed)
    const getAccessToken = useCallback((): string | null => {
        const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
        if (!token) return null;

        // If token is about to expire, trigger refresh in background
        if (isTokenExpired(token)) {
            refreshTokenFn();
        }

        return token;
    }, [refreshTokenFn]);

    // Permission checks
    const canApprove = useCallback(() => {
        return state.user?.role === 'admin' || state.user?.role === 'operator';
    }, [state.user]);

    const canRollback = useCallback(() => {
        return state.user?.role === 'admin';
    }, [state.user]);

    const isAdmin = useCallback(() => {
        return state.user?.role === 'admin';
    }, [state.user]);

    const contextValue: AuthContextValue = {
        ...state,
        login,
        logout,
        refreshToken: refreshTokenFn,
        getAccessToken,
        canApprove,
        canRollback,
        isAdmin,
    };

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook to access auth context.
 */
export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
