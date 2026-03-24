import { useEffect, useRef } from 'react';
import { TASK_CHECKBOX_STATUS_ICONS } from '@/lib/task-status-icons';
import { cn } from '@/lib/utils';

type BlockTaskStatus =
    | 'backlog'
    | 'in_progress'
    | 'starred'
    | 'assigned'
    | 'deferred'
    | 'canceled'
    | null;

type BlockTaskStatusMenuProps = {
    open: boolean;
    x: number;
    y: number;
    status: BlockTaskStatus;
    onSelect: (status: BlockTaskStatus) => void;
    onClose: () => void;
};

const STATUS_OPTIONS: Array<{
    value: BlockTaskStatus;
    label: string;
}> = [
    { value: null, label: TASK_CHECKBOX_STATUS_ICONS.open.label },
    { value: 'assigned', label: TASK_CHECKBOX_STATUS_ICONS.assigned.label },
    { value: 'deferred', label: TASK_CHECKBOX_STATUS_ICONS.deferred.label },
    { value: 'backlog', label: TASK_CHECKBOX_STATUS_ICONS.backlog.label },
    { value: 'in_progress', label: TASK_CHECKBOX_STATUS_ICONS.in_progress.label },
    { value: 'starred', label: TASK_CHECKBOX_STATUS_ICONS.starred.label },
    { value: 'canceled', label: TASK_CHECKBOX_STATUS_ICONS.canceled.label },
];

export function BlockTaskStatusMenu({
    open,
    x,
    y,
    status,
    onSelect,
    onClose,
}: BlockTaskStatusMenuProps) {
    const menuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!(event.target instanceof Node)) {
                return;
            }

            if (!menuRef.current?.contains(event.target)) {
                onClose();
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, open]);

    if (!open) {
        return null;
    }

    return (
        <div
            ref={menuRef}
            className="fixed z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            style={{ left: x, top: y }}
        >
            {STATUS_OPTIONS.map((option) => {
                const Icon = option.value === null
                    ? TASK_CHECKBOX_STATUS_ICONS.open.icon
                    : TASK_CHECKBOX_STATUS_ICONS[option.value].icon;
                const isActive = status === option.value;

                return (
                    <button
                        key={option.label}
                        type="button"
                        className={cn(
                            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-left',
                            isActive
                                ? 'bg-accent text-accent-foreground'
                                : 'text-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                        onClick={() => {
                            onSelect(option.value);
                            onClose();
                        }}
                    >
                        <Icon className="size-4 shrink-0" />
                        <span>{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
