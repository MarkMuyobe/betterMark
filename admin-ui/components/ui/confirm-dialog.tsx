/**
 * ConfirmDialog - V14 Confirmation dialog for mutations.
 */

'use client';

import { ReactNode, useState } from 'react';
import { Button } from './button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from './dialog';

export interface ConfirmDialogProps {
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'default' | 'destructive';
    onConfirm: () => Promise<void> | void;
    children: ReactNode;
    disabled?: boolean;
}

export function ConfirmDialog({
    title,
    description,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    onConfirm,
    children,
    disabled = false,
}: ConfirmDialogProps) {
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            await onConfirm();
            setOpen(false);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild disabled={disabled}>
                {children}
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isLoading}
                    >
                        {cancelText}
                    </Button>
                    <Button
                        variant={variant === 'destructive' ? 'destructive' : 'default'}
                        onClick={handleConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <span className="flex items-center gap-2">
                                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></span>
                                Processing...
                            </span>
                        ) : (
                            confirmText
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
