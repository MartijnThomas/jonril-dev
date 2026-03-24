import type { ChangeEvent } from 'react';
import type { TaskStatus } from '@/lib/task-status-icons';
import { cn } from '@/lib/utils';

type TaskToggleCheckboxProps = {
    checked: boolean;
    disabled?: boolean;
    status?: TaskStatus;
    onCheckedChange: (checked: boolean) => void;
    ariaLabel: string;
    className?: string;
};

export function TaskToggleCheckbox({
    checked,
    disabled = false,
    status,
    onCheckedChange,
    ariaLabel,
    className,
}: TaskToggleCheckboxProps) {
    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        onCheckedChange(event.target.checked);
    };

    return (
        <label
            className={cn('task-toggle-checkbox', className)}
            data-status={status ?? (checked ? 'completed' : 'open')}
        >
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
