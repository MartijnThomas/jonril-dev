import {
    closestCenter,
    DndContext,
    DragOverlay,
    PointerSensor,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Head, router, usePage } from '@inertiajs/react';
import { format, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import {
    CirclePlus,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    GripVertical,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TaskInlineContent } from '@/components/task-inline-content';
import type { TaskRenderFragment } from '@/components/task-inline-content';
import { TasksHeader } from '@/components/tasks/tasks-header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useTaskFilters } from '@/hooks/use-task-filters';
import type { FilterPreset, Filters } from '@/hooks/use-task-filters';
import AppLayout from '@/layouts/app-layout';
import { useI18n } from '@/lib/i18n';
import {
    formatShortDate,
    resolveShortDateFormat,
} from '@/lib/user-date-time-format';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type TaskItem = {
    id: number;
    block_id: string | null;
    position: number | null;
    checked: boolean;
    task_status:
        | 'canceled'
        | 'assigned'
        | 'in_progress'
        | 'migrated'
        | 'deferred'
        | 'starred'
        | 'backlog'
        | null;
    priority: 'high' | 'medium' | 'normal' | null;
    content: string;
    render_fragments: TaskRenderFragment[];
    due_date: string | null;
    deadline_date: string | null;
    note: {
        id: string;
        title: string;
        href: string;
        workspace_id: string;
        workspace_name: string | null;
        parent_title: string | null;
    };
};

type KanbanColumn = {
    key: 'backlog' | 'new' | 'doing' | 'done' | string;
    label: string;
    statuses: string[];
    tasks: TaskItem[];
    task_count: number;
};

type DragTaskMeta = {
    taskId: number;
    fromColumnKey: string;
};

type Props = {
    tasks: {
        total: number;
    };
    kanbanColumns: KanbanColumn[];
    includeColumnKeys: string[];
    filters: Filters;
    filterPresets: FilterPreset[];
    workspaces: { id: string; name: string }[];
    noteTreeOptions: {
        id: string;
        title: string;
        depth: number;
        workspace_name: string | null;
        workspace_id: string;
        is_journal: boolean;
        is_virtual: boolean;
    }[];
};

const ASSIGNEE_SWATCHES = [
    'bg-orange-200 text-orange-900',
    'bg-indigo-200 text-indigo-900',
    'bg-rose-200 text-rose-900',
    'bg-emerald-200 text-emerald-900',
    'bg-sky-200 text-sky-900',
    'bg-violet-200 text-violet-900',
] as const;

type NoteTreeNode = {
    id: string;
    title: string;
    depth: number;
    workspace_name: string | null;
    workspace_id: string;
    is_journal: boolean;
    is_virtual: boolean;
    children: NoteTreeNode[];
};

function initialsFromSeed(seed: string): string {
    const cleaned = seed.replace(/[^a-z0-9]/gi, '').toUpperCase();

    if (cleaned.length >= 2) {
        return cleaned.slice(0, 2);
    }

    return cleaned.length === 1 ? `${cleaned}X` : 'NA';
}

function resolvedPriority(task: TaskItem): 'high' | 'medium' | 'normal' | null {
    if (task.priority === 'high' || task.priority === 'medium' || task.priority === 'normal') {
        return task.priority;
    }

    for (const fragment of task.render_fragments) {
        if (
            fragment.type === 'priority_token'
            && (fragment.priority === 'high'
                || fragment.priority === 'medium'
                || fragment.priority === 'normal')
        ) {
            return fragment.priority;
        }
    }

    return null;
}

function priorityLabel(task: TaskItem): 'Normal' | 'Medium' | 'High' | null {
    const priority = resolvedPriority(task);
    if (priority === 'high') {
        return 'High';
    }

    if (priority === 'medium') {
        return 'Medium';
    }

    if (priority === 'normal') {
        return 'Normal';
    }

    return null;
}

function chunkItems<T>(items: T[], size: number): T[][] {
    if (size <= 0) {
        return [items];
    }

    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

function TaskCard({
    task,
    formatTaskDate,
}: {
    task: TaskItem;
    formatTaskDate: (value: string | null) => string | null;
}): JSX.Element {
    const priority = priorityLabel(task);
    const dueDateLabel = formatTaskDate(task.due_date);
    const deadlineDateLabel = formatTaskDate(task.deadline_date);
    const avatarSeeds = [
        `${task.note.workspace_id}-${task.id}`,
        `${task.note.id}-${task.id}`,
    ];

    return (
        <div
            className={cn(
                'block cursor-pointer rounded-2xl bg-card p-4 shadow-[0_1px_0_0_hsl(var(--border)/0.4)] ring-1 ring-border/30',
                task.checked && 'opacity-75',
            )}
        >
            <div className="line-clamp-3 text-base font-semibold text-foreground">
                <TaskInlineContent
                    fragments={
                        task.render_fragments.length > 0
                            ? task.render_fragments
                            : [{ type: 'text', text: task.content }]
                    }
                    className="leading-tight"
                    hidePriorityTokens
                    hideStatusTokens
                />
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
                <div className="flex -space-x-2">
                    {avatarSeeds.map((seed, index) => (
                        <Avatar key={seed} className="h-7 w-7 border-2 border-card">
                            <AvatarFallback
                                className={cn(
                                    'text-[10px] font-semibold',
                                    ASSIGNEE_SWATCHES[
                                        (task.id + index) % ASSIGNEE_SWATCHES.length
                                    ],
                                )}
                            >
                                {initialsFromSeed(seed)}
                            </AvatarFallback>
                        </Avatar>
                    ))}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {dueDateLabel ? (
                        <span className="inline-flex h-5 items-center rounded-full border border-orange-200/30 bg-orange-50/35 px-1.5 text-[10px] font-medium text-orange-700/80 dark:border-orange-300/10 dark:bg-orange-500/6 dark:text-orange-200/70">
                            {dueDateLabel}
                        </span>
                    ) : null}
                    {deadlineDateLabel ? (
                        <span className="inline-flex h-5 items-center rounded-full border border-red-200/30 bg-red-50/35 px-1.5 text-[10px] font-medium text-red-700/80 dark:border-red-300/10 dark:bg-red-500/6 dark:text-red-200/70">
                            {deadlineDateLabel}
                        </span>
                    ) : null}
                </div>
            </div>

            <div className="mt-3 border-t border-border/70 pt-3">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    {priority ? (
                        <Badge
                            variant="outline"
                            className="rounded-full border-border/80 bg-background px-2 py-0.5 font-medium"
                        >
                            {priority}
                        </Badge>
                    ) : (
                        <span />
                    )}
                    <span className="truncate">
                        {task.note.parent_title ? `${task.note.parent_title} / ` : ''}
                        {task.note.title}
                    </span>
                </div>
            </div>
        </div>
    );
}

function DraggableTaskCard({
    task,
    columnKey,
    isMoving,
    formatTaskDate,
}: {
    task: TaskItem;
    columnKey: string;
    isMoving: boolean;
    formatTaskDate: (value: string | null) => string | null;
}): JSX.Element {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `task-${task.id}`,
        data: {
            taskId: task.id,
            fromColumnKey: columnKey,
        } satisfies DragTaskMeta,
        disabled: isMoving,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
    };

    return (
        <div
            ref={setNodeRef}
            style={isDragging ? undefined : style}
            className={cn(
                'touch-none cursor-pointer transition-opacity',
                isMoving && 'pointer-events-none opacity-60',
                isDragging && 'opacity-10',
            )}
            {...listeners}
            {...attributes}
        >
            <TaskCard task={task} formatTaskDate={formatTaskDate} />
        </div>
    );
}

function DroppableKanbanColumn({
    column,
    isCollapsed,
    onExpand,
    onCollapse,
    children,
}: {
    column: KanbanColumn;
    isCollapsed: boolean;
    onExpand: () => void;
    onCollapse: () => void;
    children: JSX.Element;
}): JSX.Element {
    const { setNodeRef, isOver } = useDroppable({
        id: `column-${column.key}`,
        data: {
            columnKey: column.key,
        },
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'flex min-h-0 rounded-2xl bg-muted/70 transition-colors dark:bg-muted/30',
                isCollapsed
                    ? 'w-14 flex-none items-center justify-center p-1'
                    : 'min-w-[300px] flex-1 flex-col p-3',
                isOver && 'ring-2 ring-primary/35',
            )}
        >
            {isCollapsed ? (
                <button
                    type="button"
                    className="flex h-full w-full flex-col items-center justify-start gap-2 rounded-xl pt-2 text-muted-foreground transition hover:bg-background/60"
                    onClick={onExpand}
                    aria-label="Expand column"
                >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold tracking-wide uppercase">
                        {column.label}
                    </span>
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-background px-2 text-xs font-medium text-muted-foreground">
                        {column.task_count}
                    </span>
                </button>
            ) : (
                <>
                    <div className="mb-3 flex items-center justify-between gap-2 px-1">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold text-foreground">{column.label}</h2>
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-background px-2 text-xs font-medium text-muted-foreground">
                                {column.task_count}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground">
                            <button
                                type="button"
                                className="rounded-md p-1 transition hover:bg-background/70"
                                onClick={onCollapse}
                                aria-label="Collapse column"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            <button type="button" className="rounded-md p-1 transition hover:bg-background/70">
                                <GripVertical className="h-4 w-4" />
                            </button>
                            <button type="button" className="rounded-md p-1 transition hover:bg-background/70">
                                <CirclePlus className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    {children}
                </>
            )}
        </div>
    );
}

export default function TasksKanban({
    tasks,
    kanbanColumns,
    includeColumnKeys,
    filters,
    filterPresets,
    workspaces,
    noteTreeOptions,
}: Props): JSX.Element {
    const { t } = useI18n();
    const page = usePage();
    const pageProps = usePage().props as {
        auth?: {
            user?: {
                settings?: {
                    language?: string;
                    date_short_format?: string;
                };
            };
        };
    };

    const language =
        pageProps.auth?.user?.settings?.language === 'en' ? 'en' : 'nl';
    const dateLocale = language === 'en' ? enUS : nl;
    const shortDateFormat = resolveShortDateFormat(
        pageProps.auth?.user?.settings?.date_short_format,
        language,
    );
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('tasks_index.heading', 'Tasks'),
            href: '/tasks/kanban',
        },
    ];

    const {
        localFilters,
        applyFilters,
        statusOptions,
        statusSelectionLabels,
        groupingOptions,
        groupingSelectionLabel,
        datePresetOptions,
        selectedNoteScopeSet,
        selectedWorkspaceSet,
        selectedDateRange,
        hasDateFilterSelection,
        formatDateRangeLabel,
        resolveDatePresetRange,
        toggleWorkspaceSelection,
        toggleSingleNoteScope,
    } = useTaskFilters({
        initialFilters: filters,
        filterPresets,
        t,
        dateLocale,
        basePath: '/tasks/kanban',
    });

    const [searchInput, setSearchInput] = useState(filters.q ?? '');
    const [showFiltersRow, setShowFiltersRow] = useState(false);
    const [boardColumns, setBoardColumns] = useState<KanbanColumn[]>(kanbanColumns);
    const [activeDragTask, setActiveDragTask] = useState<DragTaskMeta | null>(null);
    const [movingTaskIds, setMovingTaskIds] = useState<number[]>([]);
    const [pendingMoveTargets, setPendingMoveTargets] = useState<Record<number, string>>({});
    const minSearchChars = 3;

    useEffect(() => {
        const pendingEntries = Object.entries(pendingMoveTargets);
        if (pendingEntries.length === 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setBoardColumns(kanbanColumns);
            return;
        }

        const movedTaskById = new Map<number, TaskItem>();
        boardColumns.forEach((column) => {
            column.tasks.forEach((task) => {
                if (pendingMoveTargets[task.id]) {
                    movedTaskById.set(task.id, task);
                }
            });
        });

        const nextColumns = kanbanColumns.map((column) => ({
            ...column,
            tasks: [...column.tasks],
            task_count: column.tasks.length,
        }));

        pendingEntries.forEach(([taskIdRaw, targetColumnKey]) => {
            const taskId = Number(taskIdRaw);
            const movedTask = movedTaskById.get(taskId);
            if (!movedTask) {
                return;
            }

            nextColumns.forEach((column) => {
                column.tasks = column.tasks.filter((task) => task.id !== taskId);
                column.task_count = column.tasks.length;
            });

            const targetColumn = nextColumns.find((column) => column.key === targetColumnKey);
            if (!targetColumn) {
                return;
            }

            targetColumn.tasks = [movedTask, ...targetColumn.tasks];
            targetColumn.task_count = targetColumn.tasks.length;
        });

        setBoardColumns(nextColumns);
    }, [boardColumns, kanbanColumns, pendingMoveTargets]);

    useEffect(() => {
        if (Object.keys(pendingMoveTargets).length === 0) {
            return;
        }

        const nextPending = { ...pendingMoveTargets };
        for (const [taskIdRaw, targetColumnKey] of Object.entries(pendingMoveTargets)) {
            const taskId = Number(taskIdRaw);
            const confirmedInTarget = kanbanColumns.some(
                (column) => column.key === targetColumnKey && column.tasks.some((task) => task.id === taskId),
            );
            if (confirmedInTarget) {
                delete nextPending[taskId];
            }
        }

        if (Object.keys(nextPending).length !== Object.keys(pendingMoveTargets).length) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPendingMoveTargets(nextPending);
        }
    }, [kanbanColumns, pendingMoveTargets]);

    const noteTree = useMemo<NoteTreeNode[]>(() => {
        const roots: NoteTreeNode[] = [];
        const stack: NoteTreeNode[] = [];

        for (const option of noteTreeOptions) {
            const node: NoteTreeNode = {
                id: option.id,
                title: option.title,
                depth: option.depth,
                workspace_name: option.workspace_name,
                workspace_id: option.workspace_id,
                is_journal: option.is_journal,
                is_virtual: option.is_virtual,
                children: [],
            };

            while (stack.length > 0 && stack[stack.length - 1].depth >= node.depth) {
                stack.pop();
            }

            const parent = stack[stack.length - 1];
            if (parent) {
                parent.children.push(node);
            } else {
                roots.push(node);
            }

            stack.push(node);
        }

        return roots;
    }, [noteTreeOptions]);

    const descendantIdsById = useMemo(() => {
        const map = new Map<string, string[]>();

        const collectDescendants = (node: NoteTreeNode): string[] => {
            const descendants: string[] = [];
            for (const child of node.children) {
                descendants.push(child.id, ...collectDescendants(child));
            }
            map.set(node.id, descendants);
            return descendants;
        };

        noteTree.forEach((root) => {
            collectDescendants(root);
        });

        return map;
    }, [noteTree]);

    const parentNodeIds = useMemo(() => {
        const ids = new Set<string>();
        descendantIdsById.forEach((descendants, nodeId) => {
            if (descendants.length > 0) {
                ids.add(nodeId);
            }
        });

        return ids;
    }, [descendantIdsById]);

    const noteRootsByWorkspaceId = useMemo(() => {
        const grouped = new Map<string, NoteTreeNode[]>();
        for (const root of noteTree) {
            if (!grouped.has(root.workspace_id)) {
                grouped.set(root.workspace_id, []);
            }

            grouped.get(root.workspace_id)?.push(root);
        }

        return grouped;
    }, [noteTree]);

    const [expandedNoteNodeIds, setExpandedNoteNodeIds] = useState<Set<string>>(
        new Set(
            [...parentNodeIds].filter((id) =>
                localFilters.note_scope_ids.some(
                    (selectedId) => selectedId === id || descendantIdsById.get(id)?.includes(selectedId),
                ),
            ),
        ),
    );

    const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState<Set<string>>(
        new Set(
            workspaces
                .map((workspace) => workspace.id)
                .filter((workspaceId) => {
                    if (selectedWorkspaceSet.has(workspaceId)) {
                        return true;
                    }

                    const roots = noteRootsByWorkspaceId.get(workspaceId) ?? [];
                    if (roots.length === 0) {
                        return false;
                    }

                    return roots.some((root) => {
                        if (selectedNoteScopeSet.has(root.id)) {
                            return true;
                        }

                        const descendants = descendantIdsById.get(root.id) ?? [];
                        return descendants.some((id) => selectedNoteScopeSet.has(id));
                    });
                }),
        ),
    );

    useEffect(() => {
        const trimmedInput = searchInput.trim();
        const activeQuery = localFilters.q.trim();
        if (trimmedInput === activeQuery) {
            return;
        }

        if (trimmedInput !== '' && trimmedInput.length < minSearchChars) {
            return;
        }

        const timer = window.setTimeout(() => {
            applyFilters({ q: trimmedInput }, true);
        }, 250);

        return () => window.clearTimeout(timer);
    }, [applyFilters, localFilters.q, minSearchChars, searchInput]);

    const resultsCountLabel = t(
        tasks.total === 1
            ? 'tasks_index.results_count_one'
            : 'tasks_index.results_count_other',
        tasks.total === 1 ? ':count result' : ':count results',
    ).replace(':count', String(tasks.total));

    const querySuffix = useMemo(() => {
        const url = page.url;
        const questionMarkIndex = url.indexOf('?');
        if (questionMarkIndex === -1) {
            return '';
        }

        return url.slice(questionMarkIndex);
    }, [page.url]);

    const expandedColumnKeySet = useMemo(
        () => new Set(includeColumnKeys),
        [includeColumnKeys],
    );

    const taskById = useMemo(() => {
        const map = new Map<number, TaskItem>();
        boardColumns.forEach((column) => {
            column.tasks.forEach((task) => {
                map.set(task.id, task);
            });
        });
        return map;
    }, [boardColumns]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 6,
            },
        }),
    );

    const moveTaskBetweenColumns = (
        columns: KanbanColumn[],
        taskId: number,
        fromColumnKey: string,
        targetColumnKey: string,
    ): KanbanColumn[] => {
        if (fromColumnKey === targetColumnKey) {
            return columns;
        }

        let movedTask: TaskItem | null = null;

        const withoutTask = columns.map((column) => {
            if (column.key !== fromColumnKey) {
                return column;
            }

            const remaining = column.tasks.filter((task) => {
                if (task.id === taskId) {
                    movedTask = task;
                    return false;
                }

                return true;
            });

            return {
                ...column,
                tasks: remaining,
                task_count: remaining.length,
            };
        });

        if (!movedTask) {
            return columns;
        }

        return withoutTask.map((column) => {
            if (column.key !== targetColumnKey) {
                return column;
            }

            const nextTasks = [movedTask, ...column.tasks];

            return {
                ...column,
                tasks: nextTasks,
                task_count: nextTasks.length,
            };
        });
    };

    const applyDropToColumn = (dragTask: DragTaskMeta, targetColumnKey: string): void => {
        if (dragTask.fromColumnKey === targetColumnKey) {
            return;
        }

        const task = taskById.get(dragTask.taskId);
        if (!task || movingTaskIds.includes(task.id)) {
            return;
        }

        const previousColumns = boardColumns;
        setBoardColumns((current) =>
            moveTaskBetweenColumns(current, task.id, dragTask.fromColumnKey, targetColumnKey),
        );
        setMovingTaskIds((current) => [...current, task.id]);
        setPendingMoveTargets((current) => ({
            ...current,
            [task.id]: targetColumnKey,
        }));

        router.patch(
            '/tasks/status',
            {
                note_id: task.note.id,
                block_id: task.block_id,
                position: task.position,
                target_column: targetColumnKey,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onError: () => {
                    setBoardColumns(previousColumns);
                    setPendingMoveTargets((current) => {
                        const next = { ...current };
                        delete next[task.id];

                        return next;
                    });
                },
                onFinish: () => {
                    setMovingTaskIds((current) => current.filter((id) => id !== task.id));
                },
            },
        );
    };

    const handleDragStart = (event: DragStartEvent): void => {
        const taskId = Number(event.active.data.current?.taskId ?? 0);
        const fromColumnKey = String(event.active.data.current?.fromColumnKey ?? '');
        if (!taskId || !fromColumnKey) {
            setActiveDragTask(null);
            return;
        }

        setActiveDragTask({
            taskId,
            fromColumnKey,
        });
    };

    const handleDragEnd = (event: DragEndEvent): void => {
        const dragTask = activeDragTask;
        setActiveDragTask(null);
        if (!dragTask) {
            return;
        }

        const overColumnKey = String(event.over?.data.current?.columnKey ?? '');
        if (!overColumnKey) {
            return;
        }

        applyDropToColumn(dragTask, overColumnKey);
    };

    const setColumnCollapsed = (columnKey: string, collapsed: boolean): void => {
        const nextExpanded = new Set(includeColumnKeys);
        if (collapsed) {
            nextExpanded.delete(columnKey);
        } else {
            nextExpanded.add(columnKey);
        }

        const nextQuery: Record<string, string | string[]> = {};

        if (localFilters.workspace_ids.length > 0) {
            nextQuery.workspace_ids = localFilters.workspace_ids;
        }
        if (localFilters.note_scope_ids.length > 0) {
            nextQuery.note_scope_ids = localFilters.note_scope_ids;
        }
        if (localFilters.date_preset) {
            nextQuery.date_preset = localFilters.date_preset;
        } else {
            if (localFilters.date_from) {
                nextQuery.date_from = localFilters.date_from;
            }
            if (localFilters.date_to) {
                nextQuery.date_to = localFilters.date_to;
            }
        }
        if (localFilters.status.length > 0) {
            nextQuery.status = localFilters.status;
        }
        if (localFilters.group_by) {
            nextQuery.group_by = localFilters.group_by;
        }
        if (localFilters.q.trim() !== '') {
            nextQuery.q = localFilters.q.trim();
        }

        nextQuery.include_columns = Array.from(nextExpanded);

        router.get('/tasks/kanban', nextQuery, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const toggleNoteNodeExpanded = (id: string): void => {
        setExpandedNoteNodeIds((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    };

    const toggleWorkspaceExpanded = (id: string): void => {
        setExpandedWorkspaceIds((current) => {
            const next = new Set(current);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    };

    const toggleNoteScopeWithDescendants = (id: string): void => {
        const allIds = [id, ...(descendantIdsById.get(id) ?? [])];
        const selectableIds = allIds.filter((sid) => !sid.startsWith('__j_'));
        const allSelected = selectableIds.length > 0 && selectableIds.every((sid) => selectedNoteScopeSet.has(sid));

        const nextSet = new Set(localFilters.note_scope_ids);
        if (allSelected) {
            selectableIds.forEach((sid) => nextSet.delete(sid));
        } else {
            selectableIds.forEach((sid) => nextSet.add(sid));
        }

        applyFilters(
            {
                note_scope_ids: [...nextSet],
            },
            true,
        );
    };

    const renderNoteTreeNode = (node: NoteTreeNode, depthOffset = 0): JSX.Element => {
        const descendants = descendantIdsById.get(node.id) ?? [];
        const selectableDescendants = descendants.filter((id) => !id.startsWith('__j_'));
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedNoteNodeIds.has(node.id);
        const isChecked = !node.is_virtual && selectedNoteScopeSet.has(node.id);
        const selectedSelectableCount = selectableDescendants.filter((id) => selectedNoteScopeSet.has(id)).length;
        const allSelectableSelected = selectableDescendants.length > 0 && selectableDescendants.every((id) => selectedNoteScopeSet.has(id));
        const isIndeterminate = !isChecked && selectedSelectableCount > 0 && !allSelectableSelected;

        return (
            <div key={node.id} className="space-y-0.5">
                <div
                    className="flex items-center gap-1 rounded-sm px-1 py-1 text-sm hover:bg-accent"
                    style={{ paddingLeft: `${(node.depth + depthOffset) * 14 + 4}px` }}
                >
                    <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground"
                        onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            if (hasChildren) {
                                toggleNoteNodeExpanded(node.id);
                            }
                        }}
                    >
                        {hasChildren ? (
                            isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                            )
                        ) : null}
                    </button>

                    <Checkbox
                        checked={isIndeterminate ? 'indeterminate' : (node.is_virtual ? allSelectableSelected : isChecked)}
                        disabled={node.is_virtual}
                        className="h-4 w-4"
                        onCheckedChange={() => {
                            toggleSingleNoteScope(node.id);
                            if (hasChildren && !isExpanded) {
                                toggleNoteNodeExpanded(node.id);
                            }
                        }}
                    />

                    <span className="min-w-0 flex-1 truncate">{node.title}</span>

                    {hasChildren ? (
                        <button
                            type="button"
                            className={cn(
                                'inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-xs font-medium transition-colors',
                                allSelectableSelected
                                    ? 'border-transparent bg-primary/10 text-primary'
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                            )}
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleNoteScopeWithDescendants(node.id);
                            }}
                        >
                            {t('tasks_index.select_children', 'All')}
                        </button>
                    ) : null}
                </div>

                {hasChildren && isExpanded ? (
                    <div className="space-y-0.5">
                        {node.children.map((child) => renderNoteTreeNode(child, depthOffset))}
                    </div>
                ) : null}
            </div>
        );
    };

    const activeFilterCount = useMemo(() => {
        let count = 0;

        if (localFilters.workspace_ids.length > 0) {
            count += 1;
        }
        if (localFilters.status.length > 0 && !(localFilters.status.length === 1 && localFilters.status[0] === 'open')) {
            count += 1;
        }
        if (localFilters.date_preset || localFilters.date_from || localFilters.date_to) {
            count += 1;
        }
        if (localFilters.group_by !== 'none') {
            count += 1;
        }

        return count;
    }, [localFilters]);

    const statusLabelRows = useMemo(
        () => chunkItems(statusSelectionLabels, 4),
        [statusSelectionLabels],
    );
    const formatTaskDate = (value: string | null): string | null => {
        if (!value) {
            return null;
        }

        try {
            return formatShortDate(parseISO(value), dateLocale, shortDateFormat);
        } catch {
            return value;
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('tasks_index.page_title', 'Tasks')} />

            <div className="flex h-full flex-1 flex-col overflow-hidden bg-muted/25">
                <div className="mx-auto flex h-full w-full max-w-[1560px] flex-1 flex-col gap-4 px-4 pb-6 pt-3 md:px-6">
                    <div className="relative">
                        <TasksHeader
                            title={t('tasks_kanban.heading', 'Kanban Board')}
                            resultsCountLabel={resultsCountLabel}
                            currentView="kanban"
                            querySuffix={querySuffix}
                            searchValue={searchInput}
                            onSearchChange={setSearchInput}
                            filterOpen={showFiltersRow}
                            onFilterOpenChange={setShowFiltersRow}
                            activeFilterCount={activeFilterCount}
                            filterPanel={
                                <div className="space-y-3">
                                    <Popover>
                                        <div className="min-w-0">
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-between gap-1 whitespace-nowrap text-sm font-medium text-foreground/90 hover:text-foreground"
                                                >
                                                    <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                                                        <span className="truncate">
                                                            {t('tasks_index.workspace_filter_label', 'Workspace')}
                                                        </span>
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    </span>
                                                </button>
                                            </PopoverTrigger>
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                                {localFilters.workspace_ids.length === 0 && localFilters.note_scope_ids.length === 0 ? (
                                                    <span className="inline-flex max-w-[180px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                        {t('tasks_index.all_notes', 'All notes')}
                                                    </span>
                                                ) : (
                                                    <>
                                                        {localFilters.workspace_ids.map((workspaceId) => {
                                                            const label =
                                                                workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
                                                                workspaceId;

                                                            return (
                                                                <span
                                                                    key={`workspace-${workspaceId}`}
                                                                    className="inline-flex max-w-[180px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                                                >
                                                                    <span className="truncate">{label}</span>
                                                                </span>
                                                            );
                                                        })}
                                                        {localFilters.note_scope_ids.map((noteId) => {
                                                            const label =
                                                                noteTreeOptions.find((note) => note.id === noteId)?.title ??
                                                                t('tasks_index.note_filter_label', 'Note');

                                                            return (
                                                                <span
                                                                    key={`note-${noteId}`}
                                                                    className="inline-flex max-w-[180px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                                                >
                                                                    <span className="truncate">{label}</span>
                                                                </span>
                                                            );
                                                        })}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <PopoverContent className="w-[320px] p-0" align="start">
                                            <div className="p-1.5">
                                                <div className="px-1 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                                    {t('tasks_index.workspace_note_picker_placeholder', 'Filter workspace & notes')}
                                                </div>
                                                <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                                                    {workspaces.map((workspace) => {
                                                        const roots = noteRootsByWorkspaceId.get(workspace.id) ?? [];
                                                        const hasChildren = roots.length > 0;
                                                        const isExpanded = expandedWorkspaceIds.has(workspace.id);
                                                        const checked = localFilters.workspace_ids.includes(workspace.id);

                                                        return (
                                                            <div
                                                                key={workspace.id}
                                                                className="space-y-0.5"
                                                            >
                                                                <div className="flex items-center gap-1 rounded-sm px-1 py-1 text-sm hover:bg-accent">
                                                                    <button
                                                                        type="button"
                                                                        className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground"
                                                                        onClick={(event) => {
                                                                            event.preventDefault();
                                                                            event.stopPropagation();
                                                                            if (hasChildren) {
                                                                                toggleWorkspaceExpanded(workspace.id);
                                                                            }
                                                                        }}
                                                                    >
                                                                        {hasChildren ? (
                                                                            isExpanded ? (
                                                                                <ChevronDown className="h-3.5 w-3.5" />
                                                                            ) : (
                                                                                <ChevronRight className="h-3.5 w-3.5" />
                                                                            )
                                                                        ) : null}
                                                                    </button>

                                                                    <Checkbox
                                                                        checked={checked}
                                                                        className="h-4 w-4"
                                                                        onCheckedChange={() => toggleWorkspaceSelection(workspace.id)}
                                                                    />

                                                                    <span className="min-w-0 flex-1 truncate font-medium">{workspace.name}</span>
                                                                    {checked ? (
                                                                        <Check className="h-3.5 w-3.5 text-muted-foreground" />
                                                                    ) : null}
                                                                </div>

                                                                {hasChildren && isExpanded ? (
                                                                    <div className="space-y-0.5">
                                                                        {roots.map((node) => renderNoteTreeNode(node, 1))}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div className="mt-1 border-t p-1">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full justify-center"
                                                        onClick={() =>
                                                            applyFilters(
                                                                {
                                                                    workspace_ids: [],
                                                                    note_scope_ids: [],
                                                                },
                                                                true,
                                                            )
                                                        }
                                                    >
                                                        {t('tasks_index.clear_selection', 'Clear selection')}
                                                    </Button>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Popover>
                                        <div className="min-w-0">
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-between gap-1 whitespace-nowrap text-sm font-medium text-foreground/90 hover:text-foreground"
                                                >
                                                    <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                                                        <span className="truncate">
                                                            {t('tasks_index.group_by_label', 'Group by')}
                                                        </span>
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    </span>
                                                </button>
                                            </PopoverTrigger>
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                                <span className="inline-flex max-w-[180px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                    <span className="truncate">{groupingSelectionLabel}</span>
                                                </span>
                                            </div>
                                        </div>
                                        <PopoverContent className="w-[220px] p-0" align="start">
                                            <div className="p-1">
                                                {groupingOptions.map((option) => {
                                                    const checked = localFilters.group_by === option.value;

                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            className={cn(
                                                                'flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                                                                checked ? 'bg-accent/60' : '',
                                                            )}
                                                            onClick={() =>
                                                                applyFilters(
                                                                    {
                                                                        group_by: option.value,
                                                                    },
                                                                    true,
                                                                )
                                                            }
                                                        >
                                                            <span>{option.label}</span>
                                                            {checked ? (
                                                                <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                                                            ) : null}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="border-t p-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-center"
                                                    onClick={() =>
                                                        applyFilters(
                                                            {
                                                                group_by: 'none',
                                                            },
                                                            true,
                                                        )
                                                    }
                                                >
                                                    {t('tasks_index.clear_selection', 'Clear selection')}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Popover>
                                        <div className="min-w-0">
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-between gap-1 whitespace-nowrap text-sm font-medium text-foreground/90 hover:text-foreground"
                                                >
                                                    <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                                                        <span className="truncate">
                                                            {t('tasks_index.status_filter_label', 'Status')}
                                                        </span>
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    </span>
                                                </button>
                                            </PopoverTrigger>
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                                <div className="flex flex-col gap-1">
                                                    {statusLabelRows.map((row, rowIndex) => (
                                                        <div key={`status-row-${rowIndex}`} className="flex flex-wrap items-center gap-1">
                                                            {row.map((label) => (
                                                                <span
                                                                    key={`${label}-${rowIndex}`}
                                                                    className="inline-flex max-w-[180px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                                                >
                                                                    <span className="truncate">{label}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <PopoverContent className="w-[240px] p-0" align="start">
                                            <div className="p-1">
                                                {statusOptions.map((option) => {
                                                    if (option.value.startsWith('__divider_')) {
                                                        return <hr key={option.value} className="-mx-1 my-1 border-border" />;
                                                    }

                                                    const checked = localFilters.status.includes(option.value);

                                                    return (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            className={cn(
                                                                'flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent',
                                                                checked ? 'bg-accent/60' : '',
                                                            )}
                                                            onClick={() => {
                                                                const next = checked
                                                                    ? localFilters.status.filter((value) => value !== option.value)
                                                                    : [...localFilters.status, option.value];

                                                                applyFilters(
                                                                    {
                                                                        status: next.length > 0 ? next : ['open'],
                                                                    },
                                                                    true,
                                                                );
                                                            }}
                                                        >
                                                            <span>{option.label}</span>
                                                            {checked ? (
                                                                <Check className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                                                            ) : null}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <div className="border-t p-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-center"
                                                    onClick={() =>
                                                        applyFilters(
                                                            {
                                                                status: ['open'],
                                                            },
                                                            true,
                                                        )
                                                    }
                                                >
                                                    {t('tasks_index.clear_selection', 'Clear selection')}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>

                                    <Popover>
                                        <div className="min-w-0">
                                            <PopoverTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center justify-between gap-1 whitespace-nowrap text-sm font-medium text-foreground/90 hover:text-foreground"
                                                >
                                                    <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                                                        <span className="truncate">
                                                            {t('tasks_index.period_label', 'Period')}
                                                        </span>
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    </span>
                                                </button>
                                            </PopoverTrigger>
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                                <span className="inline-flex max-w-[220px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                    <span className="truncate">
                                                        {hasDateFilterSelection
                                                            ? formatDateRangeLabel()
                                                            : t('tasks_index.all_dates', 'All dates')}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="range"
                                                locale={dateLocale}
                                                selected={selectedDateRange}
                                                onSelect={(range) => {
                                                    const from = range?.from
                                                        ? format(range.from, 'yyyy-MM-dd')
                                                        : '';
                                                    const to = range?.to
                                                        ? format(range.to, 'yyyy-MM-dd')
                                                        : from;

                                                    applyFilters(
                                                        {
                                                            date_preset: '',
                                                            date_from: from,
                                                            date_to: to,
                                                        },
                                                        true,
                                                    );
                                                }}
                                                numberOfMonths={2}
                                            />
                                            <div className="border-t p-2">
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    {datePresetOptions.map((option) => {
                                                        const isActive = localFilters.date_preset === option.value;

                                                        return (
                                                            <Button
                                                                key={option.value}
                                                                type="button"
                                                                size="sm"
                                                                variant={isActive ? 'secondary' : 'ghost'}
                                                                className="justify-start"
                                                                onClick={() => {
                                                                    const resolved = resolveDatePresetRange(option.value);
                                                                    applyFilters(
                                                                        {
                                                                            date_preset: option.value,
                                                                            date_from: resolved?.from ?? '',
                                                                            date_to: resolved?.to ?? '',
                                                                        },
                                                                        true,
                                                                    );
                                                                }}
                                                            >
                                                                {option.label}
                                                            </Button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="border-t p-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-center"
                                                    onClick={() =>
                                                        applyFilters(
                                                            {
                                                                date_preset: '',
                                                                date_from: '',
                                                                date_to: '',
                                                            },
                                                            true,
                                                        )
                                                    }
                                                >
                                                    {t('tasks_index.clear_selection', 'Clear selection')}
                                                </Button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>
                            }
                        />
                    </div>

                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragCancel={() => setActiveDragTask(null)}
                    >
                        <section className="flex min-h-0 flex-1 gap-4 overflow-x-auto pb-3">
                            {boardColumns.map((column) => {
                                const isCollapsed = !expandedColumnKeySet.has(column.key);

                                return (
                                    <DroppableKanbanColumn
                                        key={column.key}
                                        column={column}
                                        isCollapsed={isCollapsed}
                                        onExpand={() => setColumnCollapsed(column.key, false)}
                                        onCollapse={() => setColumnCollapsed(column.key, true)}
                                    >
                                        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                                            {column.tasks.length === 0 ? (
                                                <div className="rounded-xl border border-dashed border-border/70 bg-card/60 px-3 py-5 text-sm text-muted-foreground">
                                                    {t('tasks_index.no_tasks_found', 'No tasks found.')}
                                                </div>
                                            ) : (
                                                column.tasks.map((task) => (
                                                    <DraggableTaskCard
                                                        key={task.id}
                                                        task={task}
                                                        columnKey={column.key}
                                                        isMoving={movingTaskIds.includes(task.id)}
                                                        formatTaskDate={formatTaskDate}
                                                    />
                                                ))
                                            )}
                                        </div>
                                    </DroppableKanbanColumn>
                                );
                            })}
                        </section>
                        <DragOverlay dropAnimation={null}>
                            {activeDragTask ? (
                                <div className="w-[320px]">
                                    {(() => {
                                        const activeTask = taskById.get(activeDragTask.taskId);
                                        if (!activeTask) {
                                            return null;
                                        }

                                        return (
                                            <TaskCard
                                                task={activeTask}
                                                formatTaskDate={formatTaskDate}
                                            />
                                        );
                                    })()}
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            </div>

        </AppLayout>
    );
}
