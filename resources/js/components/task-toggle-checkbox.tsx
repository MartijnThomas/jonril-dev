import type { ChangeEvent } from 'react';
import { cn } from '@/lib/utils';

type TaskToggleCheckboxProps = {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange: (checked: boolean) => void;
    ariaLabel: string;
    className?: string;
};

export function TaskToggleCheckbox({
    checked,
    disabled = false,
    onCheckedChange,
    ariaLabel,
    className,
}: TaskToggleCheckboxProps) {
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        onCheckedChange(event.target.checked);
    };

    return (
        <label className={cn('task-toggle-checkbox', className)}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                aria-label={ariaLabel}
                onChange={handleChange}
            />
            <span aria-hidden="true" />
        </label>
    );
}
