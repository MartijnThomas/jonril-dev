import {
    Check,
    ChevronLeft,
    ChevronRight,
    Circle,
    CircleArrowRight,
    CircleCheckBig,
    CircleChevronLeft,
    CircleStar,
    CircleSlash2,
    CircleUserRound,
    LoaderCircle,
    Pause,
    Slash,
    Star,
    UserRound,
    X,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import type { FC } from 'react';

export type TaskStatus =
    | 'open'
    | 'assigned'
    | 'in_progress'
    | 'backlog'
    | 'deferred'
    | 'starred'
    | 'migrated'
    | 'canceled'
    | 'completed';

export type TaskStatusIcon = FC<LucideProps>;

/**
 * Maps each task status to its display icon and accessible label.
 * These "circle" icons are used for counters, badges, and summary indicators — not inside checkboxes.
 * For icons rendered inside checkboxes use TASK_CHECKBOX_STATUS_ICONS.
 */
export const TASK_STATUS_ICONS: Record<
    TaskStatus,
    { icon: TaskStatusIcon; label: string }
> = {
    open: { icon: Circle, label: 'Open' },
    assigned: { icon: CircleUserRound, label: 'Assigned' },
    in_progress: { icon: LoaderCircle, label: 'In progress' },
    backlog: { icon: CircleArrowRight, label: 'Backlog' },
    deferred: { icon: CircleChevronLeft, label: 'Deferred' },
    starred: { icon: CircleStar, label: 'Starred' },
    migrated: { icon: CircleArrowRight, label: 'Migrated' },
    canceled: { icon: CircleSlash2, label: 'Canceled' },
    completed: { icon: CircleCheckBig, label: 'Done' },
};

/**
 * Maps each task status to the marker icon rendered *inside* the checkbox circle.
 *
 * These icons are used in:
 * - The events sidebar timeblock task checkbox (React-rendered button)
 * - The block-task-status-menu in the editor (React-rendered menu items)
 * - The task index page and related panel via `resolveTaskCheckboxStatus` + TaskToggleCheckbox
 *
 * CSS-rendered checkboxes (TaskToggleCheckbox in app.css, block-tree editor in block-editor-only.scss)
 * use the same visual language via `data-status` / `data-task-status` attributes:
 * - open      → empty yellow-bordered circle, no inner icon
 * - completed → filled yellow circle + white checkmark (Check)
 * - assigned  → yellow UserRound stroke icon
 * - in_progress → yellow half-circle arc (Slash token `/`)
 * - backlog   → gray Pause (two vertical bars) icon
 * - deferred  → gray ChevronLeft icon
 * - starred   → yellow Star filled icon
 * - migrated  → gray ChevronRight icon
 * - canceled  → gray X icon
 */
export const TASK_CHECKBOX_STATUS_ICONS: Record<
    TaskStatus,
    { icon: TaskStatusIcon; label: string }
> = {
    open: { icon: Circle, label: 'Open' },
    completed: { icon: Check, label: 'Done' },
    assigned: { icon: UserRound, label: 'Assigned' },
    in_progress: { icon: Slash, label: 'In progress' },
    backlog: { icon: Pause, label: 'Backlog' },
    deferred: { icon: ChevronLeft, label: 'Deferred' },
    starred: { icon: Star, label: 'Starred' },
    migrated: { icon: ChevronRight, label: 'Migrated' },
    canceled: { icon: X, label: 'Canceled' },
};

/**
 * Resolves the visual checkbox status from task data.
 * Specific statuses take precedence; falls back to completed/open from `checked`.
 */
export function resolveTaskCheckboxStatus(
    taskStatus: string | null | undefined,
    checked: boolean,
): TaskStatus {
    switch (taskStatus) {
        case 'canceled':
            return 'canceled';
        case 'migrated':
            return 'migrated';
        case 'in_progress':
            return 'in_progress';
        case 'backlog':
            return 'backlog';
        case 'assigned':
            return 'assigned';
        case 'deferred':
            return 'deferred';
        case 'starred':
            return 'starred';
        default:
            return checked ? 'completed' : 'open';
    }
}

/**
 * Ordered list of statuses for display purposes (e.g. task count badges).
 */
export const TASK_STATUS_ORDER: TaskStatus[] = [
    'open',
    'assigned',
    'in_progress',
    'backlog',
    'deferred',
    'starred',
    'migrated',
    'completed',
    'canceled',
];
