/**
 * useMutation - V14 Mutation hook with double-submit prevention.
 *
 * Provides loading state and error handling for mutation operations.
 */

'use client';

import { useState, useCallback, useRef } from 'react';
import { ApiError } from '@/lib/api';

export interface MutationState<TResult> {
    /** Whether the mutation is currently loading */
    isLoading: boolean;
    /** The error from the last mutation attempt */
    error: ApiError | Error | null;
    /** The result from the last successful mutation */
    result: TResult | null;
}

export interface UseMutationOptions<TResult> {
    /** Callback when mutation succeeds */
    onSuccess?: (result: TResult) => void;
    /** Callback when mutation fails */
    onError?: (error: ApiError | Error) => void;
    /** Callback when mutation completes (success or failure) */
    onSettled?: () => void;
}

export interface UseMutationReturn<TArgs extends any[], TResult> extends MutationState<TResult> {
    /** Execute the mutation */
    mutate: (...args: TArgs) => Promise<TResult | undefined>;
    /** Reset the mutation state */
    reset: () => void;
}

/**
 * Hook for handling mutations with loading state and double-submit prevention.
 *
 * @example
 * const { mutate, isLoading, error } = useMutation(
 *   (id: string) => approveSuggestion(agentType, id),
 *   { onSuccess: () => refetch() }
 * );
 *
 * <Button onClick={() => mutate(id)} disabled={isLoading}>
 *   {isLoading ? 'Loading...' : 'Approve'}
 * </Button>
 */
export function useMutation<TArgs extends any[], TResult>(
    mutationFn: (...args: TArgs) => Promise<TResult>,
    options?: UseMutationOptions<TResult>
): UseMutationReturn<TArgs, TResult> {
    const [state, setState] = useState<MutationState<TResult>>({
        isLoading: false,
        error: null,
        result: null,
    });

    // Track if a mutation is in progress to prevent double-submit
    const inProgressRef = useRef(false);

    const mutate = useCallback(
        async (...args: TArgs): Promise<TResult | undefined> => {
            // Prevent double-submit
            if (inProgressRef.current) {
                console.warn('Mutation already in progress, ignoring duplicate call');
                return undefined;
            }

            inProgressRef.current = true;
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            try {
                const result = await mutationFn(...args);
                setState({ isLoading: false, error: null, result });
                options?.onSuccess?.(result);
                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setState({ isLoading: false, error, result: null });
                options?.onError?.(error);
                return undefined;
            } finally {
                inProgressRef.current = false;
                options?.onSettled?.();
            }
        },
        [mutationFn, options]
    );

    const reset = useCallback(() => {
        setState({ isLoading: false, error: null, result: null });
    }, []);

    return {
        ...state,
        mutate,
        reset,
    };
}

/**
 * Hook for handling multiple concurrent mutations.
 * Useful when you have a list of items that can each be mutated independently.
 *
 * @example
 * const { mutate, isLoading } = useMutationMap(
 *   (id: string) => approveSuggestion(agentType, id),
 *   { onSuccess: () => refetch() }
 * );
 *
 * items.map(item => (
 *   <Button onClick={() => mutate(item.id, item.id)} disabled={isLoading(item.id)}>
 *     Approve
 *   </Button>
 * ))
 */
export function useMutationMap<TKey extends string, TArgs extends any[], TResult>(
    mutationFn: (...args: TArgs) => Promise<TResult>,
    options?: UseMutationOptions<TResult>
) {
    const [loadingMap, setLoadingMap] = useState<Record<TKey, boolean>>({} as Record<TKey, boolean>);
    const [errorMap, setErrorMap] = useState<Record<TKey, ApiError | Error | null>>({} as Record<TKey, ApiError | Error | null>);

    const mutate = useCallback(
        async (key: TKey, ...args: TArgs): Promise<TResult | undefined> => {
            // Prevent double-submit for this key
            if (loadingMap[key]) {
                console.warn(`Mutation for ${key} already in progress`);
                return undefined;
            }

            setLoadingMap(prev => ({ ...prev, [key]: true }));
            setErrorMap(prev => ({ ...prev, [key]: null }));

            try {
                const result = await mutationFn(...args);
                options?.onSuccess?.(result);
                return result;
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                setErrorMap(prev => ({ ...prev, [key]: error }));
                options?.onError?.(error);
                return undefined;
            } finally {
                setLoadingMap(prev => ({ ...prev, [key]: false }));
                options?.onSettled?.();
            }
        },
        [mutationFn, options, loadingMap]
    );

    const isLoading = useCallback((key: TKey) => loadingMap[key] ?? false, [loadingMap]);
    const getError = useCallback((key: TKey) => errorMap[key] ?? null, [errorMap]);
    const anyLoading = Object.values(loadingMap).some(Boolean);

    return {
        mutate,
        isLoading,
        getError,
        anyLoading,
    };
}
