/**
 * ErrorDisplay - V14 Error display with correlationId.
 */

'use client';

interface ErrorDisplayProps {
    error: string;
    correlationId?: string;
    onDismiss?: () => void;
}

export function ErrorDisplay({ error, correlationId, onDismiss }: ErrorDisplayProps) {
    return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex justify-between items-start">
                <div>
                    <p className="text-sm font-medium text-red-800">Error</p>
                    <p className="text-sm text-red-600 mt-1">{error}</p>
                    {correlationId && (
                        <p className="text-xs text-red-500 mt-2">
                            Correlation ID: <code className="bg-red-100 px-1 rounded">{correlationId}</code>
                        </p>
                    )}
                </div>
                {onDismiss && (
                    <button
                        onClick={onDismiss}
                        className="text-red-400 hover:text-red-600"
                        aria-label="Dismiss error"
                    >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Parse error response to extract message and correlationId.
 */
export function parseApiError(error: unknown): { message: string; correlationId?: string } {
    if (error instanceof Error) {
        // Try to parse error message as JSON
        try {
            const parsed = JSON.parse(error.message);
            if (parsed.error) {
                return {
                    message: parsed.error.message || 'An error occurred',
                    correlationId: parsed.error.correlationId,
                };
            }
        } catch {
            return { message: error.message };
        }
        return { message: error.message };
    }

    if (typeof error === 'object' && error !== null) {
        const err = error as { error?: { message?: string; correlationId?: string }; message?: string };
        if (err.error) {
            return {
                message: err.error.message || 'An error occurred',
                correlationId: err.error.correlationId,
            };
        }
        if (err.message) {
            return { message: err.message };
        }
    }

    return { message: 'An unknown error occurred' };
}
