import {
    Circle,
    CircleArrowRight,
    CircleCheckBig,
    CircleChevronLeft,
    CircleStar,
    CircleSlash2,
    CircleUserRound,
    LoaderCircle,
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
 */
export const TASK_STATUS_ICONS: Record<TaskStatus, { icon: TaskStatusIcon; label: string }> = {
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
