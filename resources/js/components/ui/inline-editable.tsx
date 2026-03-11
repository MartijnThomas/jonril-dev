import { Check, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type InlineEditableProps = {
    value: string;
    onSave: (value: string) => void;
    renderValue?: (value: string) => ReactNode;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
    editAriaLabel?: string;
    saveAriaLabel?: string;
};

export function InlineEditable({
    value,
    onSave,
    renderValue,
    className,
    inputClassName,
    disabled = false,
    editAriaLabel = 'Edit',
    saveAriaLabel = 'Save',
}: InlineEditableProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [draftValue, setDraftValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        setDraftValue(value);
    }, [value]);

    useEffect(() => {
        if (!isEditing) {
            return;
        }

        inputRef.current?.focus();
        inputRef.current?.select();
    }, [isEditing]);

    const commit = () => {
        const next = draftValue.trim();
        setIsEditing(false);
        if (next === '' || next === value) {
            setDraftValue(value);
            return;
        }

        onSave(next);
    };

    if (isEditing) {
        return (
            <div className={cn('flex min-w-0 items-center gap-2', className)}>
                <Input
                    ref={inputRef}
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                    onBlur={commit}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                        }
                        if (event.key === 'Escape') {
                            event.preventDefault();
                            setDraftValue(value);
                            setIsEditing(false);
                        }
                    }}
                    className={cn('h-8', inputClassName)}
                    disabled={disabled}
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={commit}
                    disabled={disabled}
                    aria-label={saveAriaLabel}
                >
                    <Check className="h-4 w-4" />
                </Button>
            </div>
        );
    }

    return (
        <div className={cn('flex min-w-0 items-center gap-1', className)}>
            <div className="min-w-0 max-w-full truncate">
                {renderValue ? renderValue(value) : value}
            </div>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setIsEditing(true)}
                disabled={disabled}
                aria-label={editAriaLabel}
            >
                <Pencil className="h-4 w-4" />
            </Button>
        </div>
    );
}
