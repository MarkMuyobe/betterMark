/**
 * ErrorAlert - V14 Error display component with correlationId.
 *
 * Displays API errors with the correlation ID for debugging.
 */

'use client';

import { AlertCircle, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '@/lib/api';

export interface ErrorAlertProps {
    error: string | ApiError | Error | null;
    onDismiss?: () => void;
}

export function ErrorAlert({ error, onDismiss }: ErrorAlertProps) {
    const [copied, setCopied] = useState(false);

    if (!error) return null;

    // Extract error details
    let message: string;
    let correlationId: string | undefined;
    let code: string | undefined;

    if (error instanceof ApiError) {
        message = error.message;
        correlationId = error.correlationId;
        code = error.code;
    } else if (error instanceof Error) {
        message = error.message;
    } else {
        message = error;
    }

    const handleCopyCorrelationId = async () => {
        if (correlationId) {
            try {
                await navigator.clipboard.writeText(correlationId);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch {
                // Clipboard API not available
            }
        }
    };

    return (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-md mb-4">
            <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between">
                        <div>
                            {code && (
                                <span className="text-xs font-mono bg-destructive/20 px-1.5 py-0.5 rounded mr-2">
                                    {code}
                                </span>
                            )}
                            <span className="font-medium">{message}</span>
                        </div>
                        {onDismiss && (
                            <button
                                onClick={onDismiss}
                                className="text-destructive/70 hover:text-destructive ml-2"
                                aria-label="Dismiss error"
                            >
                                &times;
                            </button>
                        )}
                    </div>

                    {correlationId && (
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground">Correlation ID:</span>
                            <code className="bg-destructive/10 px-1.5 py-0.5 rounded font-mono">
                                {correlationId}
                            </code>
                            <button
                                onClick={handleCopyCorrelationId}
                                className="p-1 hover:bg-destructive/20 rounded"
                                title="Copy correlation ID"
                            >
                                {copied ? (
                                    <Check className="h-3 w-3 text-green-600" />
                                ) : (
                                    <Copy className="h-3 w-3" />
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
