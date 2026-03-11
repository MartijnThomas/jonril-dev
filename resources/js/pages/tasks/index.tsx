import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    addDays,
    endOfMonth,
    endOfWeek,
    format,
    formatDistance,
    parseISO,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { TaskInlineContent } from '@/components/task-inline-content';
import type { TaskRenderFragment } from '@/components/task-inline-content';
import { TaskToggleCheckbox } from '@/components/task-toggle-checkbox';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import AppLayout from '@/layouts/app-layout';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type TaskItem = {
    id: number;
    block_id: string | null;
    position: number;
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
    backlog_promoted_at?: string | null;
    completed_at?: string | null;
    canceled_at?: string | null;
    started_at?: string | null;
    priority: 'high' | 'medium' | 'normal' | null;
    content: string;
    render_fragments: TaskRenderFragment[];
    due_date: string | null;
    deadline_date: string | null;
    journal_date: string | null;
    mentions: string[];
    hashtags: string[];
    migrated_to_note?: {
        id: string;
        title: string;
        href: string;
    } | null;
    migrated_from_note?: {
        id: string;
        title: string;
        href: string;
    } | null;
    note: {
        id: string;
        title: string;
        href: string;
        workspace_id: string;
        workspace_name: string | null;
        parent_id: string | null;
        parent_title: string | null;
    };
    updated_at: string | null;
    created_at: string | null;
};

type PaginatorLink = {
    url: string | null;
    label: string;
    active: boolean;
};

type Filters = {
    q: string;
    workspace_ids: string[];
    note_scope_ids: string[];
    mention: string;
    hashtag: string;
    date_preset: '' | 'today' | 'this_week' | 'this_month' | 'today_plus_7';
    date_from: string;
    date_to: string;
    status: string[];
    group_by: 'none' | 'note' | 'date';
    sort: 'updated' | 'due' | 'deadline' | 'note' | 'position';
    direction: 'asc' | 'desc';
};

type Props = {
    tasks: {
        data: TaskItem[];
        links: PaginatorLink[];
        total: number;
    };
    filters: Filters;
    workspaces: { id: string; name: string }[];
    noteTreeOptions: { id: string; title: string; depth: number; workspace_name: string | null; workspace_id: string }[];
};

type NoteTreeNode = {
    id: string;
    title: string;
    depth: number;
    workspace_name: string | null;
    workspace_id: string;
    children: NoteTreeNode[];
};

type SelectionPill = {
    key: string;
    label: string;
    kind: 'workspace' | 'parent' | 'note';
};

export default function TasksIndex({
    tasks,
    filters,
    workspaces,
    noteTreeOptions,
}: Props) {
    const { t } = useI18n();
    const pageProps = usePage().props as {
        auth?: {
            user?: {
                settings?: {
                    language?: string;
                };
            };
        };
        currentWorkspace?: {
            id?: string;
        };
    };
    const language =
        pageProps.auth?.user?.settings?.language === 'en' ? 'en' : 'nl';
    const currentWorkspaceId =
        typeof pageProps.currentWorkspace?.id === 'string' &&
        pageProps.currentWorkspace.id.trim() !== ''
            ? pageProps.currentWorkspace.id.trim()
            : null;
    const dateLocale = language === 'en' ? enUS : nl;
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('tasks_index.heading', 'Tasks'),
            href: '/tasks',
        },
    ];

    const [localFilters, setLocalFilters] = useState<Filters>({
        ...filters,
        date_preset: filters.date_preset ?? '',
        workspace_ids:
            filters.workspace_ids && filters.workspace_ids.length > 0
                ? filters.workspace_ids
                : [],
        note_scope_ids:
            filters.note_scope_ids && filters.note_scope_ids.length > 0
                ? filters.note_scope_ids
                : [],
        group_by: filters.group_by ?? 'none',
    });
    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);
    const [showAllSelectionPills, setShowAllSelectionPills] = useState(false);
    const [relativeNow, setRelativeNow] = useState<number>(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => {
            setRelativeNow(Date.now());
        }, 30_000);

        return () => window.clearInterval(timer);
    }, []);
    const statusOptions = useMemo(
        () => [
            { value: 'open', label: t('tasks_index.status_open', 'Open') },
            { value: 'completed', label: t('tasks_index.status_completed', 'Completed') },
            { value: 'canceled', label: t('tasks_index.status_canceled', 'Canceled') },
            { value: 'migrated', label: t('tasks_index.status_migrated', 'Migrated') },
            { value: 'assigned', label: t('tasks_index.status_assigned', 'Assigned') },
            { value: 'in_progress', label: t('tasks_index.status_in_progress', 'In progress') },
            { value: 'starred', label: t('tasks_index.status_starred', 'Starred') },
            { value: 'backlog', label: t('tasks_index.status_backlog', 'Backlog') },
        ],
        [t],
    );
    const statusSelectionLabels = useMemo(
        () =>
            localFilters.status
                .map((value) => statusOptions.find((option) => option.value === value)?.label)
                .filter((label): label is string => Boolean(label)),
        [localFilters.status, statusOptions],
    );
    const groupingOptions = useMemo(
        () => [
            { value: 'note' as const, label: t('tasks_index.group_by_note', 'By note') },
            { value: 'date' as const, label: t('tasks_index.group_by_date', 'By due & deadline') },
        ],
        [t],
    );
    const datePresetOptions = useMemo(
        () => [
            { value: 'today' as const, label: t('tasks_index.date_preset_today', 'Today') },
            { value: 'this_week' as const, label: t('tasks_index.date_preset_this_week', 'This week') },
            { value: 'this_month' as const, label: t('tasks_index.date_preset_this_month', 'This month') },
            { value: 'today_plus_7' as const, label: t('tasks_index.date_preset_today_plus_7', 'Today + 7 days') },
        ],
        [t],
    );
    const resolveDatePresetRange = (
        preset: Filters['date_preset'],
    ): { from: string; to: string } | null => {
        const today = new Date();

        const toIsoDate = (value: Date) => format(value, 'yyyy-MM-dd');

        if (preset === 'today') {
            const day = toIsoDate(today);
            return { from: day, to: day };
        }

        if (preset === 'this_week') {
            return {
                from: toIsoDate(startOfWeek(today, { weekStartsOn: 1 })),
                to: toIsoDate(endOfWeek(today, { weekStartsOn: 1 })),
            };
        }

        if (preset === 'this_month') {
            return {
                from: toIsoDate(startOfMonth(today)),
                to: toIsoDate(endOfMonth(today)),
            };
        }

        if (preset === 'today_plus_7') {
            return {
                from: toIsoDate(today),
                to: toIsoDate(addDays(today, 7)),
            };
        }

        return null;
    };
    const groupingSelectionLabel = useMemo(
        () => groupingOptions.find((option) => option.value === localFilters.group_by)?.label
            ?? t('tasks_index.group_by_none', 'No grouping'),
        [groupingOptions, localFilters.group_by, t],
    );

    const toQuery = (state: Filters) => {
        const query: Record<string, string | number | string[]> = {
            sort: state.sort,
            direction: state.direction,
        };

        if (state.q.trim() !== '') query.q = state.q.trim();
        if (state.workspace_ids.length > 0) query.workspace_ids = state.workspace_ids;
        if (state.note_scope_ids.length > 0) query.note_scope_ids = state.note_scope_ids;
        if (state.mention.trim() !== '') query.mention = state.mention.trim();
        if (state.hashtag.trim() !== '') query.hashtag = state.hashtag.trim();
        if (state.date_preset) {
            query.date_preset = state.date_preset;
        } else {
            if (state.date_from) query.date_from = state.date_from;
            if (state.date_to) query.date_to = state.date_to;
        }
        if (state.status.length > 0) query.status = state.status;
        if (state.group_by) query.group_by = state.group_by;

        return query;
    };

    const visitWithFilters = (state: Filters) => {
        router.get('/tasks', toQuery(state), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const applyFilters = (next: Partial<Filters>, submit = false) => {
        const merged = { ...localFilters, ...next };
        setLocalFilters(merged);

        if (submit) {
            visitWithFilters(merged);
        }
    };

    const onSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        visitWithFilters(localFilters);
    };

    const resetFilters = () => {
        const reset: Filters = {
            q: '',
            workspace_ids: currentWorkspaceId ? [currentWorkspaceId] : [],
            note_scope_ids: [],
            mention: '',
            hashtag: '',
            date_preset: '',
            date_from: '',
            date_to: '',
            status: ['open'],
            group_by: 'none',
            sort: 'due',
            direction: 'asc',
        };

        setLocalFilters(reset);
        visitWithFilters(reset);
    };

    const toggleDateSort = (field: 'due' | 'deadline') => {
        if (localFilters.sort !== field) {
            applyFilters({ sort: field, direction: 'asc' }, true);
            return;
        }

        applyFilters(
            {
                direction: localFilters.direction === 'asc' ? 'desc' : 'asc',
            },
            true,
        );
    };

    const updateTaskChecked = (
        task: TaskItem,
        checked: boolean,
        promoteBacklog: boolean,
        options?: {
            onSuccess?: () => void;
            onError?: () => void;
        },
    ) => {
        const taskId = task.id;
        if (pendingTaskIds.includes(taskId)) {
            return;
        }

        setPendingTaskIds((current) => [...current, taskId]);

        router.patch(
            '/tasks/checked',
            {
                note_id: task.note.id,
                block_id: task.block_id,
                position: task.position,
                checked,
                promote_backlog: promoteBacklog,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onSuccess: options?.onSuccess,
                onError: options?.onError,
                onFinish: () => {
                    setPendingTaskIds((current) =>
                        current.filter((id) => id !== taskId),
                    );
                },
            },
        );
    };

    const toggleTaskChecked = (task: TaskItem) => {
        if (pendingTaskIds.includes(task.id)) {
            return;
        }

        const isBacklogPromotion =
            task.task_status === 'backlog' && task.checked !== true;
        const nextChecked = isBacklogPromotion ? false : !task.checked;

        updateTaskChecked(task, nextChecked, isBacklogPromotion, {
            onSuccess: () => {
                toast.success(
                    nextChecked
                        ? t('tasks_index.toast_task_completed', 'Task completed.')
                        : t('tasks_index.toast_task_reopened', 'Task reopened.'),
                    {
                        action: {
                            label: t('tasks_index.undo', 'Undo'),
                            onClick: () => {
                                updateTaskChecked(task, task.checked, false, {
                                    onSuccess: () => {
                                        toast.success(
                                            t(
                                                'tasks_index.toast_undo_success',
                                                'Task change undone.',
                                            ),
                                        );
                                    },
                                    onError: () => {
                                        toast.error(
                                            t(
                                                'tasks_index.toast_undo_failed',
                                                'Failed to undo task change.',
                                            ),
                                        );
                                    },
                                });
                            },
                        },
                    },
                );
            },
            onError: () => {
                toast.error(
                    t(
                        'tasks_index.toast_update_failed',
                        'Failed to update task status.',
                    ),
                );
            },
        });
    };

    const labelText = (label: string) =>
        label
            .replace(/&laquo;/g, '«')
            .replace(/&raquo;/g, '»')
            .replace(/<[^>]+>/g, '')
            .trim();

    const parseDate = (value: string): Date | undefined => {
        if (!value) {
            return undefined;
        }

        return parseISO(value);
    };

    const selectedDateRange: DateRange = {
        from: parseDate(localFilters.date_from),
        to: parseDate(localFilters.date_to),
    };

    const formatDateRangeLabel = () => {
        if (localFilters.date_preset) {
            const presetLabel = datePresetOptions.find(
                (option) => option.value === localFilters.date_preset,
            )?.label;

            if (presetLabel) {
                return presetLabel;
            }
        }

        if (selectedDateRange.from && selectedDateRange.to) {
            return `${format(selectedDateRange.from, 'PPP', { locale: dateLocale })} - ${format(selectedDateRange.to, 'PPP', { locale: dateLocale })}`;
        }

        if (selectedDateRange.from) {
            return t('tasks_index.date_from_label', 'From :date').replace(
                ':date',
                format(selectedDateRange.from, 'PPP', { locale: dateLocale }),
            );
        }

        return t('tasks_index.date_range_label', 'Date range (due + deadline)');
    };
    const hasDateFilterSelection = Boolean(
        localFilters.date_preset || localFilters.date_from || localFilters.date_to,
    );
    const workspaceNameById = useMemo(
        () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
        [workspaces],
    );

    const formatGroupDate = (value: string) => {
        try {
            return format(parseISO(value), 'PPP', { locale: dateLocale });
        } catch {
            return value;
        }
    };

    const getWorkspacePathSegment = (task: TaskItem) =>
        task.note.workspace_name?.trim() ||
        workspaceNameById.get(task.note.workspace_id)?.trim() ||
        '';

    const formatPromotedAt = (value: string) => {
        try {
            return format(parseISO(value), 'PPP', { locale: dateLocale });
        } catch {
            return value;
        }
    };

    const formatTaskStateAt = (value: string) => {
        try {
            return formatDistance(parseISO(value), new Date(relativeNow), {
                addSuffix: true,
                locale: dateLocale,
            });
        } catch {
            return value;
        }
    };

    const renderTaskMetadataAndPath = (task: TaskItem) => {
        const metadata: Array<{
            key: string;
            label: string;
            value: string;
            href?: string;
        }> = [];

        if (task.task_status === 'migrated') {
            if (task.migrated_to_note) {
                metadata.push({
                    key: 'migrated-to',
                    label: t('tasks_index.migrated_to', 'Migrated to'),
                    value: task.migrated_to_note.title,
                    href: task.migrated_to_note.href,
                });
            } else if (task.migrated_from_note) {
                metadata.push({
                    key: 'migrated-from',
                    label: t('tasks_index.migrated_from', 'Migrated from'),
                    value: task.migrated_from_note.title,
                    href: task.migrated_from_note.href,
                });
            }
        }

        if (task.backlog_promoted_at) {
            metadata.push({
                key: 'promoted-at',
                label: t('tasks_index.promoted_at', 'Promoted at'),
                value: formatPromotedAt(task.backlog_promoted_at),
            });
        }

        if (task.checked && task.completed_at) {
            metadata.push({
                key: 'completed-at',
                label: t('tasks_index.completed_at', 'Completed at'),
                value: formatTaskStateAt(task.completed_at),
            });
        }

        if (task.task_status === 'canceled' && task.canceled_at) {
            metadata.push({
                key: 'canceled-at',
                label: t('tasks_index.canceled_at', 'Canceled at'),
                value: formatTaskStateAt(task.canceled_at),
            });
        }

        if (task.task_status === 'in_progress' && task.started_at) {
            metadata.push({
                key: 'started-at',
                label: t('tasks_index.started_at', 'Started at'),
                value: formatTaskStateAt(task.started_at),
            });
        }

        return (
            <>
                {metadata.length > 0 ? (
                    <div className="md-task-migration-meta mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
                        {metadata.map((item) => (
                            <span key={item.key} className="inline-flex min-w-0 items-baseline gap-1">
                                <span className="md-task-migration-meta-label shrink-0">
                                    {item.label}:
                                </span>{' '}
                                {item.href ? (
                                    <Link
                                        href={item.href}
                                        className="md-task-migration-link truncate"
                                    >
                                        {item.value}
                                    </Link>
                                ) : (
                                    <span className="truncate text-inherit">
                                        {item.value}
                                    </span>
                                )}
                            </span>
                        ))}
                    </div>
                ) : null}
                <div className="mt-1 text-xs text-muted-foreground">
                    {getWorkspacePathSegment(task) ? (
                        <span>
                            {getWorkspacePathSegment(task)} /{' '}
                        </span>
                    ) : null}
                    {task.note.parent_title
                        ? `${task.note.parent_title} / `
                        : ''}
                    <Link
                        href={task.note.href}
                        className="text-foreground underline-offset-2 hover:underline"
                    >
                        {task.note.title}
                    </Link>
                </div>
            </>
        );
    };

    const groupedTasksByNote = useMemo(() => {
        const map = new Map<
            string,
            {
                noteId: string;
                noteTitle: string;
                noteHref: string;
                tasks: TaskItem[];
            }
        >();

        for (const task of tasks.data) {
            const key = task.note.id;
            if (!map.has(key)) {
                map.set(key, {
                    noteId: task.note.id,
                    noteTitle: task.note.title,
                    noteHref: task.note.href,
                    tasks: [],
                });
            }

            map.get(key)?.tasks.push(task);
        }

        return [...map.values()]
            .map((group) => ({
                ...group,
                tasks: [...group.tasks].sort((a, b) => a.position - b.position),
            }))
            .sort((a, b) => a.noteTitle.localeCompare(b.noteTitle));
    }, [tasks.data]);

    const groupedTasksByDate = useMemo(() => {
        const map = new Map<
            string,
            {
                key: string;
                date: string;
                tasks: TaskItem[];
            }
        >();

        const addToGroup = (date: string | null, task: TaskItem) => {
            if (!date) {
                return;
            }

            const key = date;
            if (!map.has(key)) {
                map.set(key, { key, date, tasks: [] });
            }

            const group = map.get(key);
            if (!group) {
                return;
            }

            const alreadyIncluded = group.tasks.some(
                (existing) =>
                    existing.id === task.id &&
                    existing.note.id === task.note.id &&
                    existing.position === task.position,
            );

            if (!alreadyIncluded) {
                group.tasks.push(task);
            }
        };

        for (const task of tasks.data) {
            addToGroup(task.due_date, task);
            addToGroup(task.deadline_date, task);

            if (task.journal_date && !task.due_date && !task.deadline_date) {
                addToGroup(task.journal_date, task);
            }
        }

        return [...map.values()]
            .map((group) => ({
                ...group,
                tasks: [...group.tasks].sort((a, b) => {
                    const aTime = a.created_at ? Date.parse(a.created_at) : 0;
                    const bTime = b.created_at ? Date.parse(b.created_at) : 0;
                    if (aTime !== bTime) {
                        return aTime - bTime;
                    }

                    return a.position - b.position;
                }),
            }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [tasks.data]);

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

    const selectedNoteScopeSet = useMemo(
        () => new Set(localFilters.note_scope_ids),
        [localFilters.note_scope_ids],
    );
    const selectedWorkspaceSet = useMemo(
        () => new Set(localFilters.workspace_ids),
        [localFilters.workspace_ids],
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

    const noteTitleById = useMemo(() => {
        const map = new Map<string, string>();
        for (const option of noteTreeOptions) {
            map.set(option.id, option.title);
        }

        return map;
    }, [noteTreeOptions]);

    const noteDepthById = useMemo(() => {
        const map = new Map<string, number>();
        for (const option of noteTreeOptions) {
            map.set(option.id, option.depth);
        }

        return map;
    }, [noteTreeOptions]);

    const selectionPills = useMemo<SelectionPill[]>(() => {
        const pills: SelectionPill[] = [];

        for (const workspaceId of localFilters.workspace_ids) {
            const workspace = workspaces.find((item) => item.id === workspaceId);
            if (!workspace) {
                continue;
            }

            pills.push({
                key: `workspace:${workspace.id}`,
                label: workspace.name,
                kind: 'workspace',
            });
        }

        const selectedIds = [...selectedNoteScopeSet];
        const parentCandidates = selectedIds
            .filter((id) => {
                const descendants = descendantIdsById.get(id) ?? [];
                return descendants.length > 0 && descendants.every((childId) => selectedNoteScopeSet.has(childId));
            })
            .sort((a, b) => (noteDepthById.get(a) ?? 0) - (noteDepthById.get(b) ?? 0));

        const coveredIds = new Set<string>();
        for (const parentId of parentCandidates) {
            const descendants = descendantIdsById.get(parentId) ?? [];
            const subtreeIds = [parentId, ...descendants];
            if (subtreeIds.some((id) => coveredIds.has(id))) {
                continue;
            }

            subtreeIds.forEach((id) => coveredIds.add(id));
            pills.push({
                key: `parent:${parentId}`,
                label: `${noteTitleById.get(parentId) ?? t('tasks_index.untitled_task', 'Untitled task')} (${descendants.length})`,
                kind: 'parent',
            });
        }

        for (const noteId of selectedIds) {
            if (coveredIds.has(noteId)) {
                continue;
            }

            pills.push({
                key: `note:${noteId}`,
                label: noteTitleById.get(noteId) ?? t('tasks_index.untitled_task', 'Untitled task'),
                kind: 'note',
            });
        }

        return pills;
    }, [
        descendantIdsById,
        localFilters.workspace_ids,
        noteDepthById,
        noteTitleById,
        selectedNoteScopeSet,
        t,
        workspaces,
    ]);

    const visibleSelectionPills = selectionPills.slice(0, 3);
    const hiddenSelectionPills = selectionPills.slice(3);
    const showAllWorkspaceNotePill = selectionPills.length === 0;

    const toggleNoteNodeExpanded = (id: string) => {
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

    const toggleWorkspaceExpanded = (id: string) => {
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

    const toggleWorkspaceSelection = (workspaceId: string) => {
        const checked = selectedWorkspaceSet.has(workspaceId);
        const next = checked
            ? localFilters.workspace_ids.filter((id) => id !== workspaceId)
            : [...localFilters.workspace_ids, workspaceId];

        applyFilters(
            {
                workspace_ids: next,
                note_scope_ids: [],
            },
            true,
        );
    };

    const toggleSingleNoteScope = (id: string) => {
        const next = selectedNoteScopeSet.has(id)
            ? localFilters.note_scope_ids.filter((value) => value !== id)
            : [...localFilters.note_scope_ids, id];

        applyFilters(
            {
                note_scope_ids: next,
            },
            true,
        );
    };

    const toggleNoteScopeWithDescendants = (id: string) => {
        const subtreeIds = [id, ...(descendantIdsById.get(id) ?? [])];
        const allSelected = subtreeIds.every((subtreeId) => selectedNoteScopeSet.has(subtreeId));

        const nextSet = new Set(localFilters.note_scope_ids);
        if (allSelected) {
            subtreeIds.forEach((subtreeId) => nextSet.delete(subtreeId));
        } else {
            subtreeIds.forEach((subtreeId) => nextSet.add(subtreeId));
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
        const hasChildren = descendants.length > 0;
        const isExpanded = expandedNoteNodeIds.has(node.id);
        const isChecked = selectedNoteScopeSet.has(node.id);
        const selectedDescendantsCount = descendants.filter((id) => selectedNoteScopeSet.has(id)).length;
        const allDescendantsSelected = hasChildren && descendants.every((id) => selectedNoteScopeSet.has(id));
        const isIndeterminate = !isChecked && selectedDescendantsCount > 0 && !allDescendantsSelected;

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
                        checked={isIndeterminate ? 'indeterminate' : isChecked}
                        className="h-4 w-4"
                        onCheckedChange={() => toggleSingleNoteScope(node.id)}
                    />

                    <span className="min-w-0 flex-1 truncate">{node.title}</span>

                    {hasChildren ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleNoteScopeWithDescendants(node.id);
                            }}
                        >
                            {t('tasks_index.select_children', 'All')}
                        </Button>
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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('tasks_index.page_title', 'Tasks')} />

            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
                <section className="rounded-xl bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h1 className="text-lg font-semibold">
                            {t('tasks_index.heading', 'Tasks')}
                        </h1>
                        <span className="text-sm text-muted-foreground">
                            {t('tasks_index.results_count', ':count results').replace(
                                ':count',
                                String(tasks.total),
                            )}
                        </span>
                    </div>

                    <form onSubmit={onSubmit} className="mt-4 space-y-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                            <Popover>
                                <div className="md:col-span-5">
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 text-sm font-medium text-foreground/90 hover:text-foreground"
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {t('tasks_index.workspace_note_picker_trigger', 'Workspaces & notes')}
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            </span>
                                        </button>
                                    </PopoverTrigger>
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                        {showAllWorkspaceNotePill ? (
                                            <span className="inline-flex max-w-[220px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                                <span className="truncate">{t('tasks_index.all', 'All')}</span>
                                            </span>
                                        ) : null}
                                        {visibleSelectionPills.map((pill) => (
                                            <span
                                                key={pill.key}
                                                className="inline-flex max-w-[220px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                            >
                                                <span className="truncate">{pill.label}</span>
                                            </span>
                                        ))}
                                        {hiddenSelectionPills.length > 0 ? (
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                                onClick={() => setShowAllSelectionPills((current) => !current)}
                                            >
                                                + {hiddenSelectionPills.length}
                                                {showAllSelectionPills ? (
                                                    <ChevronDown className="h-3 w-3" />
                                                ) : (
                                                    <ChevronRight className="h-3 w-3" />
                                                )}
                                            </button>
                                        ) : null}
                                    </div>
                                    {hiddenSelectionPills.length > 0 ? (
                                        <div className="mt-1">
                                            {showAllSelectionPills ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {hiddenSelectionPills.map((pill) => (
                                                        <span
                                                            key={pill.key}
                                                            className="inline-flex max-w-[280px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                                        >
                                                            <span className="truncate">{pill.label}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ) : null}
                                </div>
                                <PopoverContent className="w-[420px] p-0" align="start">
                                    <div className="p-1.5">
                                        <div className="px-1 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                            {t('tasks_index.workspace_note_picker_placeholder', 'Filter workspace & notes')}
                                        </div>
                                        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                                            {workspaces.map((workspace) => {
                                                const roots = noteRootsByWorkspaceId.get(workspace.id) ?? [];
                                                const hasChildren = roots.length > 0;
                                                const isExpanded = expandedWorkspaceIds.has(workspace.id);
                                                const checked = selectedWorkspaceSet.has(workspace.id);

                                                return (
                                                    <div key={workspace.id} className="space-y-0.5">
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
                                <div className="md:col-span-2">
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 text-sm font-medium text-foreground/90 hover:text-foreground"
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {t('tasks_index.status_filter_label', 'Status')}
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            </span>
                                        </button>
                                    </PopoverTrigger>
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                        {statusSelectionLabels.map((label) => (
                                            <span
                                                key={label}
                                                className="inline-flex max-w-[180px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                            >
                                                <span className="truncate">{label}</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <PopoverContent className="w-[240px] p-0" align="start">
                                    <div className="p-1">
                                        {statusOptions.map((option) => {
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
                                <div className="md:col-span-3">
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 text-sm font-medium text-foreground/90 hover:text-foreground"
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {t('tasks_index.period_label', 'Period')}
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
                                                ? format(
                                                      range.from,
                                                      'yyyy-MM-dd',
                                                  )
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

                            <Popover>
                                <div className="md:col-span-2">
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 text-sm font-medium text-foreground/90 hover:text-foreground"
                                        >
                                            <span className="inline-flex items-center gap-1">
                                                {t('tasks_index.grouping_label', 'Grouping')}
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            </span>
                                        </button>
                                    </PopoverTrigger>
                                    <div className="mt-1 flex flex-wrap items-center gap-1">
                                        <span className="inline-flex max-w-[220px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                            <span className="truncate">{groupingSelectionLabel}</span>
                                        </span>
                                    </div>
                                </div>
                                <PopoverContent className="w-[240px] p-0" align="start">
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
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <Input
                                value={localFilters.q}
                                onChange={(event) =>
                                    applyFilters({ q: event.target.value })
                                }
                                placeholder={t(
                                    'tasks_index.search_placeholder',
                                    'Search tasks, notes, parents...',
                                )}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                            <Input
                                value={localFilters.mention}
                                onChange={(event) =>
                                    applyFilters({
                                        mention: event.target.value,
                                    })
                                }
                                placeholder={t(
                                    'tasks_index.mention_placeholder',
                                    'Mention',
                                )}
                                className="md:col-span-3"
                            />

                            <Input
                                value={localFilters.hashtag}
                                onChange={(event) =>
                                    applyFilters({
                                        hashtag: event.target.value,
                                    })
                                }
                                placeholder={t(
                                    'tasks_index.hashtag_placeholder',
                                    'Hashtag',
                                )}
                                className="md:col-span-3"
                            />

                            <Button
                                type="button"
                                variant="outline"
                                className="md:col-span-3"
                                onClick={() => toggleDateSort('due')}
                            >
                                <span className="inline-flex items-center gap-1">
                                    {t('tasks_index.sort_due', 'Due')}
                                    {localFilters.sort === 'due' ? (
                                        localFilters.direction === 'asc' ? (
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        ) : (
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        )
                                    ) : (
                                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                </span>
                            </Button>

                            <Button
                                type="button"
                                variant="outline"
                                className="md:col-span-3"
                                onClick={() => toggleDateSort('deadline')}
                            >
                                <span className="inline-flex items-center gap-1">
                                    {t('tasks_index.sort_deadline', 'Deadline')}
                                    {localFilters.sort === 'deadline' ? (
                                        localFilters.direction === 'asc' ? (
                                            <ArrowUp className="h-3.5 w-3.5" />
                                        ) : (
                                            <ArrowDown className="h-3.5 w-3.5" />
                                        )
                                    ) : (
                                        <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                </span>
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={resetFilters}
                                >
                                    {t('tasks_index.reset', 'Reset')}
                                </Button>
                                <Button type="submit">
                                    {t('tasks_index.apply', 'Apply')}
                                </Button>
                            </div>
                        </div>
                    </form>
                </section>

                <section className="editor-ui-font mx-auto w-full max-w-3xl rounded-xl bg-card p-4 md:p-6">
                    {tasks.data.length === 0 ? (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            {t(
                                'tasks_index.no_results',
                                'No tasks match these filters.',
                            )}
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {localFilters.group_by === 'none'
                                ? tasks.data.map((task) => (
                                      <div key={task.id} className="flex items-start gap-3 py-1.5">
                                          <TaskToggleCheckbox
                                              className="mt-1.5"
                                              checked={task.checked}
                                              status={
                                                  task.task_status === 'canceled'
                                                      ? 'canceled'
                                                      : task.task_status === 'migrated'
                                                        ? 'migrated'
                                                        : task.task_status === 'in_progress'
                                                          ? 'in_progress'
                                                        : task.task_status === 'backlog'
                                                          ? 'backlog'
                                                        : task.checked
                                                          ? 'completed'
                                                          : 'open'
                                              }
                                              disabled={
                                                  pendingTaskIds.includes(task.id) ||
                                                  task.task_status === 'canceled' ||
                                                  task.task_status === 'migrated'
                                              }
                                              ariaLabel={t(
                                                  'tasks_index.toggle_task_aria',
                                                  'Toggle task :task',
                                              ).replace(
                                                  ':task',
                                                  task.content || String(task.id),
                                              )}
                                              onCheckedChange={() =>
                                                  toggleTaskChecked(task)
                                              }
                                          />
                                          <div className="min-w-0 flex-1 pt-[1px]">
                                              <p
                                                  className={cn(
                                                      'text-base leading-[1.62]',
                                                      task.task_status === 'canceled' &&
                                                          'line-through opacity-70',
                                                      task.task_status === 'migrated' &&
                                                          'opacity-70',
                                                      task.task_status !== 'canceled' &&
                                                          task.task_status !== 'migrated' &&
                                                          task.checked &&
                                                          'line-through opacity-70',
                                                  )}
                                              >
                                                  <TaskInlineContent
                                                      fragments={
                                                          task.render_fragments.length > 0
                                                              ? task.render_fragments
                                                              : [
                                                                    {
                                                                        type: 'text',
                                                                        text:
                                                                            task.content ||
                                                                            t(
                                                                                'tasks_index.untitled_task',
                                                                                'Untitled task',
                                                                            ),
                                                                    },
                                                                ]
                                                      }
                                                      language={language}
                                                      canceled={task.task_status === 'canceled'}
                                                      className={cn(
                                                          'editor-ui-font text-base leading-[1.62] font-normal tracking-[-0.01em]',
                                                          (task.task_status === 'canceled' ||
                                                              task.task_status === 'migrated' ||
                                                              task.checked) &&
                                                              'task-inline--faded',
                                                      )}
                                                      priorityStyle="range"
                                                      hidePriorityTokens
                                                      hideStatusTokens
                                                  />
                                              </p>
                                              {renderTaskMetadataAndPath(task)}
                                          </div>
                                      </div>
                                  ))
                                : localFilters.group_by === 'date'
                                  ? groupedTasksByDate.map((group) => (
                                      <div key={group.key} className="space-y-1.5">
                                          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                              {formatGroupDate(group.date)}
                                          </h3>
                                          <div className="space-y-0.5">
                                              {group.tasks.map((task) => (
                                                  <div
                                                      key={`${group.key}-${task.id}-${task.position}`}
                                                      className="flex items-start gap-3 py-1.5"
                                                  >
                                                      <TaskToggleCheckbox
                                                          className="mt-1.5"
                                                          checked={task.checked}
                                                          status={
                                                              task.task_status === 'canceled'
                                                                  ? 'canceled'
                                                                  : task.task_status === 'migrated'
                                                                    ? 'migrated'
                                                                    : task.task_status === 'in_progress'
                                                                      ? 'in_progress'
                                                                    : task.task_status === 'backlog'
                                                                      ? 'backlog'
                                                                    : task.checked
                                                                      ? 'completed'
                                                                      : 'open'
                                                          }
                                                          disabled={
                                                              pendingTaskIds.includes(task.id) ||
                                                              task.task_status === 'canceled' ||
                                                              task.task_status === 'migrated'
                                                          }
                                                          ariaLabel={t(
                                                              'tasks_index.toggle_task_aria',
                                                              'Toggle task :task',
                                                          ).replace(
                                                              ':task',
                                                              task.content || String(task.id),
                                                          )}
                                                          onCheckedChange={() =>
                                                              toggleTaskChecked(task)
                                                          }
                                                      />
                                                      <div className="min-w-0 flex-1 pt-[1px]">
                                                          <p
                                                              className={cn(
                                                                  'text-base leading-[1.62]',
                                                                  task.task_status === 'canceled' &&
                                                                      'line-through opacity-70',
                                                                  task.task_status === 'migrated' &&
                                                                      'opacity-70',
                                                                  task.task_status !== 'canceled' &&
                                                                      task.task_status !== 'migrated' &&
                                                                      task.checked &&
                                                                      'line-through opacity-70',
                                                              )}
                                                          >
                                                              <TaskInlineContent
                                                                  fragments={
                                                                      task.render_fragments.length > 0
                                                                          ? task.render_fragments
                                                                          : [
                                                                                {
                                                                                    type: 'text',
                                                                                    text:
                                                                                        task.content ||
                                                                                        t(
                                                                                            'tasks_index.untitled_task',
                                                                                            'Untitled task',
                                                                                        ),
                                                                                },
                                                                            ]
                                                                  }
                                                                  language={language}
                                                                  canceled={task.task_status === 'canceled'}
                                                                  className={cn(
                                                                      'editor-ui-font text-base leading-[1.62] font-normal tracking-[-0.01em]',
                                                                      (task.task_status === 'canceled' ||
                                                                          task.task_status === 'migrated' ||
                                                                          task.checked) &&
                                                                          'task-inline--faded',
                                                                  )}
                                                                  priorityStyle="range"
                                                                  hidePriorityTokens
                                                                  hideStatusTokens
                                                              />
                                                          </p>
                                                          {renderTaskMetadataAndPath(task)}
                                                      </div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  ))
                                  : groupedTasksByNote.map((group) => (
                                      <div key={group.noteId} className="space-y-1.5">
                                          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                              <Link
                                                  href={group.noteHref}
                                                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                              >
                                                  {group.noteTitle}
                                              </Link>
                                          </h3>
                                          <div className="space-y-0.5">
                                              {group.tasks.map((task) => (
                                                  <div
                                                      key={task.id}
                                                      className="flex items-start gap-3 py-1.5"
                                                  >
                                                      <TaskToggleCheckbox
                                                          className="mt-1.5"
                                                          checked={task.checked}
                                                          status={
                                                              task.task_status === 'canceled'
                                                                  ? 'canceled'
                                                                  : task.task_status === 'migrated'
                                                                    ? 'migrated'
                                                                    : task.task_status === 'in_progress'
                                                                      ? 'in_progress'
                                                                    : task.task_status === 'backlog'
                                                                      ? 'backlog'
                                                                    : task.checked
                                                                      ? 'completed'
                                                                      : 'open'
                                                          }
                                                          disabled={
                                                              pendingTaskIds.includes(task.id) ||
                                                              task.task_status === 'canceled' ||
                                                              task.task_status === 'migrated'
                                                          }
                                                          ariaLabel={t(
                                                              'tasks_index.toggle_task_aria',
                                                              'Toggle task :task',
                                                          ).replace(
                                                              ':task',
                                                              task.content || String(task.id),
                                                          )}
                                                          onCheckedChange={() =>
                                                              toggleTaskChecked(task)
                                                          }
                                                      />
                                                      <div className="min-w-0 flex-1 pt-[1px]">
                                                          <p
                                                              className={cn(
                                                                  'text-base leading-[1.62]',
                                                                  task.task_status === 'canceled' &&
                                                                      'line-through opacity-70',
                                                                  task.task_status === 'migrated' &&
                                                                      'opacity-70',
                                                                  task.task_status !== 'canceled' &&
                                                                      task.task_status !== 'migrated' &&
                                                                      task.checked &&
                                                                      'line-through opacity-70',
                                                              )}
                                                          >
                                                              <TaskInlineContent
                                                                  fragments={
                                                                      task.render_fragments.length > 0
                                                                          ? task.render_fragments
                                                                          : [
                                                                                {
                                                                                    type: 'text',
                                                                                    text:
                                                                                        task.content ||
                                                                                        t(
                                                                                            'tasks_index.untitled_task',
                                                                                            'Untitled task',
                                                                                        ),
                                                                                },
                                                                            ]
                                                                  }
                                                                  language={language}
                                                                  canceled={task.task_status === 'canceled'}
                                                                  className={cn(
                                                                      'editor-ui-font text-base leading-[1.62] font-normal tracking-[-0.01em]',
                                                                      (task.task_status === 'canceled' ||
                                                                          task.task_status === 'migrated' ||
                                                                          task.checked) &&
                                                                          'task-inline--faded',
                                                                  )}
                                                                  priorityStyle="range"
                                                                  hidePriorityTokens
                                                                  hideStatusTokens
                                                              />
                                                          </p>
                                                          {renderTaskMetadataAndPath(task)}
                                                      </div>
                                                  </div>
                                              ))}
                                          </div>
                                      </div>
                                  ))}
                        </div>
                    )}

                    {tasks.links.length > 3 ? (
                        <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
                            {tasks.links.map((link, index) => {
                                if (!link.url) {
                                    return (
                                        <span
                                            key={`ellipsis-${index}`}
                                            className="px-2 py-1 text-muted-foreground"
                                        >
                                            {labelText(link.label)}
                                        </span>
                                    );
                                }

                                return (
                                    <Link
                                        key={`${link.url}-${index}-${link.label}`}
                                        href={link.url}
                                        preserveScroll
                                        className={`rounded border px-2 py-1 transition-colors ${
                                            link.active
                                                ? 'bg-accent text-foreground'
                                                : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                    >
                                        {labelText(link.label)}
                                    </Link>
                                );
                            })}
                        </div>
                    ) : null}
                </section>
            </div>
        </AppLayout>
    );
}
