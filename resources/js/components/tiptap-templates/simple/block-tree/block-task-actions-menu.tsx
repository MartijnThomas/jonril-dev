import { BringToFront, Circle, MoveRight, Pause, X } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type TaskStatus =
    | 'backlog'
    | 'in_progress'
    | 'starred'
    | 'assigned'
    | 'deferred'
    | 'canceled'
    | null;

type MigrateTarget = {
    key: string;
    label: string;
    subtitle?: string;
    target_note_id?: string | null;
    target_journal_granularity?: string | null;
    target_journal_period?: string | null;
};

type BlockTaskActionsMenuProps = {
    open: boolean;
    x: number;
    y: number;
    status: TaskStatus;
    defaultMigrateTargets: MigrateTarget[];
    onClose: () => void;
    onToggleTask: () => void;
    onSetStatus: (status: TaskStatus) => void;
    onOpenMigratePicker: () => void;
    onQuickMigrate: (target: MigrateTarget) => void;
};

export function BlockTaskActionsMenu({
    open,
    x,
    y,
    status,
    defaultMigrateTargets,
    onClose,
    onToggleTask,
    onSetStatus,
    onOpenMigratePicker,
    onQuickMigrate,
}: BlockTaskActionsMenuProps) {
    const backlogLabel = status === 'backlog' ? 'Pick up from backlog' : 'Add to backlog';

    if (!open) {
        return null;
    }

    const iconSlotClass = 'inline-flex w-4 items-center justify-center shrink-0';

    return (
        <DropdownMenu open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Task actions anchor"
                    className="fixed z-50 size-1 opacity-0 pointer-events-none"
                    style={{ left: x, top: y }}
                />
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={1}
            >
                <DropdownMenuItem
                    onClick={() => {
                        onToggleTask();
                        onClose();
                    }}
                >
                    <span className={iconSlotClass}>
                        <Circle className="size-4" />
                    </span>
                    <span>Toggle task</span>
                </DropdownMenuItem>

                <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="gap-2">
                        <span className={iconSlotClass}>
                            <MoveRight className="size-4" />
                        </span>
                        <span>Migrate task</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                        {defaultMigrateTargets.map((target) => (
                            <DropdownMenuItem
                                key={target.key}
                                onClick={() => {
                                    onQuickMigrate(target);
                                    onClose();
                                }}
                            >
                                <div className="min-w-0">
                                    <div className="truncate">{target.label}</div>
                                    {target.subtitle ? (
                                        <div className="text-muted-foreground truncate text-xs">
                                            {target.subtitle}
                                        </div>
                                    ) : null}
                                </div>
                            </DropdownMenuItem>
                        ))}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={() => {
                                onOpenMigratePicker();
                                onClose();
                            }}
                        >
                            <span className={iconSlotClass}>
                                <MoveRight className="size-4" />
                            </span>
                            <span>Other destination…</span>
                        </DropdownMenuItem>
                    </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuItem
                    onClick={() => {
                        onSetStatus(status === 'backlog' ? null : 'backlog');
                        onClose();
                    }}
                >
                    <span className={iconSlotClass}>
                        <Pause className="size-4" />
                    </span>
                    <span>{backlogLabel}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                    onClick={() => {
                        onSetStatus('in_progress');
                        onClose();
                    }}
                >
                    <span className={iconSlotClass}>
                        <BringToFront className="size-4" />
                    </span>
                    <span>Mark as in progress</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                    onClick={() => {
                        onSetStatus('canceled');
                        onClose();
                    }}
                >
                    <span className={iconSlotClass}>
                        <X className="size-4" />
                    </span>
                    <span>Cancel task</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
