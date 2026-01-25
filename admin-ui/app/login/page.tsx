/**
 * Login Page - V14 Admin authentication.
 */

'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
    const { login, error: authError, isLoading } = useAuth();
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        try {
            const success = await login(username, password);
            if (success) {
                router.push('/');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const displayError = error || authError;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl font-bold text-center">
                        BetterMark Admin
                    </CardTitle>
                    <CardDescription className="text-center">
                        Sign in to access the admin control plane
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {displayError && (
                            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
                                {displayError}
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="username" className="text-sm font-medium">
                                Username
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter username"
                                required
                                disabled={isSubmitting || isLoading}
                                autoComplete="username"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="Enter password"
                                required
                                disabled={isSubmitting || isLoading}
                                autoComplete="current-password"
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full"
                            disabled={isSubmitting || isLoading || !username || !password}
                        >
                            {isSubmitting || isLoading ? (
                                <span className="flex items-center gap-2">
                                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                                    Signing in...
                                </span>
                            ) : (
                                'Sign in'
                            )}
                        </Button>

                        <div className="text-xs text-gray-500 text-center mt-4">
                            <p>Default accounts for testing:</p>
                            <p className="mt-1">
                                <code className="bg-gray-100 px-1 rounded">admin / admin123</code> - Full access
                            </p>
                            <p>
                                <code className="bg-gray-100 px-1 rounded">operator / operator123</code> - Read + approve
                            </p>
                            <p>
                                <code className="bg-gray-100 px-1 rounded">auditor / auditor123</code> - Read only
                            </p>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
