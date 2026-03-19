import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    format,
    formatDistance,
    parseISO,
} from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import {
    Bookmark,
    Check,
    ChevronDown,
    ChevronRight,
    Home,
    Filter,
    Search,
    Settings2,
    Star,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { TaskInlineContent } from '@/components/task-inline-content';
import type { TaskRenderFragment } from '@/components/task-inline-content';
import { TaskToggleCheckbox } from '@/components/task-toggle-checkbox';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import AppLayout from '@/layouts/app-layout';
import { useTaskFilters } from '@/hooks/use-task-filters';
import type { FilterPreset, Filters } from '@/hooks/use-task-filters';
import { useI18n } from '@/lib/i18n';
import {
    formatLongDate,
    resolveLongDateFormat,
} from '@/lib/user-date-time-format';
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
    children?: TaskChildItem[];
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

type TaskChildItem = {
    type: 'taskItem' | 'listItem' | 'checkItem';
    list_type: 'taskList' | 'bulletList' | 'orderedList' | 'checkList';
    block_id: string | null;
    checked: boolean | null;
    content_text: string;
    render_fragments: TaskRenderFragment[];
    mentions: string[];
    hashtags: string[];
    due_date: string | null;
    deadline_date: string | null;
    children: TaskChildItem[];
};

type PaginatorLink = {
    url: string | null;
    label: string;
    active: boolean;
};

type Props = {
    tasks: {
        data: TaskItem[];
        links: PaginatorLink[];
        total: number;
    };
    filters: Filters;
    filterPresets: FilterPreset[];
    workspaces: { id: string; name: string }[];
    noteTreeOptions: { id: string; title: string; depth: number; workspace_name: string | null; workspace_id: string; is_journal: boolean; is_virtual: boolean }[];
};

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

type SelectionPill = {
    key: string;
    label: string;
    kind: 'workspace' | 'parent' | 'note';
};

export default function TasksIndex({
    tasks,
    filters,
    filterPresets,
    workspaces,
    noteTreeOptions,
}: Props) {
    const { t } = useI18n();
    const pageProps = usePage().props as {
        auth?: {
            user?: {
                settings?: {
                    language?: string;
                    date_long_format?: string;
                };
            };
        };
        currentWorkspace?: {
            id?: string;
        };
    };
    const language =
        pageProps.auth?.user?.settings?.language === 'en' ? 'en' : 'nl';
    const dateLocale = language === 'en' ? enUS : nl;
    const longDateFormat = resolveLongDateFormat(
        pageProps.auth?.user?.settings?.date_long_format,
        language,
    );
    const resultsCountLabel = t(
        tasks.total === 1
            ? 'tasks_index.results_count_one'
            : 'tasks_index.results_count_other',
        tasks.total === 1 ? ':count result' : ':count results',
    ).replace(':count', String(tasks.total));
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('tasks_index.heading', 'Tasks'),
            href: '/tasks',
        },
    ];

    const {
        localFilters,
        setLocalFilters,
        savePresetOpen,
        setSavePresetOpen,
        presetName,
        setPresetName,
        presetFavorite,
        setPresetFavorite,
        presetProcessing,
        selectedNoteScopeSet,
        selectedWorkspaceSet,
        statusOptions,
        statusSelectionLabels,
        groupingOptions,
        groupingSelectionLabel,
        datePresetOptions,
        activeFilterPreset,
        selectedDateRange,
        hasDateFilterSelection,
        formatDateRangeLabel,
        applyFilters,
        visitWithFilters,
        applyPreset,
        clearAppliedPreset,
        setDefaultPreset,
        openSavePresetDialog,
        saveCurrentFiltersPreset,
        resolveDatePresetRange,
        toggleWorkspaceSelection,
        toggleSingleNoteScope,
    } = useTaskFilters({ initialFilters: filters, filterPresets, t, dateLocale });

    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);
    const [showAllSelectionPills, setShowAllSelectionPills] = useState(false);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [relativeNow, setRelativeNow] = useState<number>(() => Date.now());
    const [expandedTaskIds, setExpandedTaskIds] = useState<number[]>([]);
    const [searchInput, setSearchInput] = useState(filters.q ?? '');
    const minSearchChars = 3;

    const favoriteFilterPresets = useMemo(
        () => filterPresets.filter((preset) => preset.favorite),
        [filterPresets],
    );
    const nonFavoriteFilterPresets = useMemo(
        () => filterPresets.filter((preset) => !preset.favorite),
        [filterPresets],
    );

    useEffect(() => {
        const timer = window.setInterval(() => {
            setRelativeNow(Date.now());
        }, 30_000);

        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        setSearchInput(localFilters.q ?? '');
    }, [localFilters.q]);

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

    const workspaceNameById = useMemo(
        () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
        [workspaces],
    );

    const formatGroupDate = (value: string) => {
        try {
            const label = formatLongDate(parseISO(value), dateLocale, longDateFormat);
            return label.length > 0 ? label.charAt(0).toUpperCase() + label.slice(1) : label;
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

    const taskVisualStatus = (
        task: Pick<TaskItem, 'task_status' | 'checked'>,
    ): 'open' | 'completed' | 'canceled' | 'migrated' | 'in_progress' | 'backlog' | 'assigned' => {
        if (task.task_status === 'canceled') {
            return 'canceled';
        }

        if (task.task_status === 'migrated') {
            return 'migrated';
        }

        if (task.task_status === 'in_progress') {
            return 'in_progress';
        }

        if (task.task_status === 'backlog') {
            return 'backlog';
        }

        if (task.task_status === 'assigned') {
            return 'assigned';
        }

        return task.checked ? 'completed' : 'open';
    };

    const hasTaskChildren = (task: TaskItem) =>
        Array.isArray(task.children) && task.children.length > 0;

    const toggleExpandedTask = (taskId: number) => {
        setExpandedTaskIds((current) =>
            current.includes(taskId)
                ? current.filter((id) => id !== taskId)
                : [...current, taskId],
        );
    };

    const renderTaskChildren = (
        children: TaskChildItem[],
        level = 1,
    ): React.JSX.Element | null => {
        if (!children.length) {
            return null;
        }

        return (
            <ul className={cn('mt-1 space-y-1.5', level > 1 && 'mt-0.5')}>
                {children.map((child, index) => {
                    const lineThrough = child.checked === true;
                    const showCheck = child.type === 'taskItem' || child.type === 'checkItem';
                    const markerIsSquare = child.type === 'checkItem';
                    const markerWrapClass =
                        child.type === 'taskItem'
                            ? 'mt-[5px]'
                            : child.type === 'checkItem'
                              ? 'mt-[4px]'
                              : child.list_type === 'orderedList'
                                ? 'mt-[5px]'
                                : 'mt-[1px]';
                    const childStatusToken = child.render_fragments.find(
                        (fragment) =>
                            fragment.type === 'status_token' && fragment.status,
                    )?.status;
                    const childTaskStatus: TaskItem['task_status'] =
                        childStatusToken === 'canceled' ||
                        childStatusToken === 'migrated' ||
                        childStatusToken === 'in_progress' ||
                        childStatusToken === 'backlog' ||
                        childStatusToken === 'assigned' ||
                        childStatusToken === 'starred' ||
                        childStatusToken === 'deferred'
                            ? childStatusToken
                            : null;
                    const childVisualStatus = taskVisualStatus({
                        task_status: childTaskStatus,
                        checked: child.checked === true,
                    });

                    return (
                        <li key={`${child.block_id ?? child.content_text}-${level}-${index}`}>
                            <div className="flex items-start gap-2">
                                <span
                                    className={cn(
                                        markerWrapClass,
                                        'w-5 shrink-0 text-muted-foreground opacity-55',
                                    )}
                                >
                                    {child.type === 'taskItem' ? (
                                        <TaskToggleCheckbox
                                            checked={child.checked === true}
                                            status={childVisualStatus}
                                            disabled={false}
                                            ariaLabel=""
                                            onCheckedChange={() => undefined}
                                            className="pointer-events-none"
                                        />
                                    ) : showCheck ? (
                                        <span
                                            className={cn(
                                                'inline-block size-3.5 border-[1.5px] border-[#efb019]',
                                                markerIsSquare ? 'rounded-[4px]' : 'rounded-full',
                                                child.checked &&
                                                    'bg-[#efb019] shadow-[inset_0_0_0_2px_var(--background)]',
                                            )}
                                        />
                                    ) : (
                                        <span className={cn(child.list_type !== 'orderedList' && 'text-[1.05rem] leading-none')}>
                                            {child.list_type === 'orderedList' ? '1.' : '•'}
                                        </span>
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <TaskInlineContent
                                        fragments={
                                            child.render_fragments.length > 0
                                                ? child.render_fragments
                                                : [
                                                      {
                                                          type: 'text',
                                                          text:
                                                              child.content_text ||
                                                              t(
                                                                  'tasks_index.untitled_task',
                                                                  'Untitled task',
                                                              ),
                                                      },
                                                  ]
                                        }
                                        language={language}
                                        className={cn(
                                            'editor-ui-font text-base leading-[1.62] font-normal tracking-[-0.01em] text-foreground opacity-55',
                                            lineThrough && 'line-through opacity-70',
                                        )}
                                        priorityStyle="range"
                                        hidePriorityTokens
                                        hideStatusTokens
                                    />
                                    {renderTaskChildren(child.children, level + 1)}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    const renderTaskMetadataAndPath = (
        task: TaskItem,
        options?: { showPath?: boolean },
    ) => {
        const showPath = options?.showPath ?? true;
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
                {showPath ? (
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
                ) : null}
            </>
        );
    };

    const renderTaskRow = (
        task: TaskItem,
        key?: string | number,
        options?: { showPath?: boolean },
    ) => {
        const hasChildren = hasTaskChildren(task);
        const isExpanded = expandedTaskIds.includes(task.id);

        return (
            <div
                key={key ?? task.id}
                className={cn(
                    'flex items-start gap-3 rounded-md px-2 py-2 transition-[background-color,padding,border-radius] duration-200 ease-out',
                    hasChildren && isExpanded && 'bg-muted/40',
                )}
            >
                <TaskToggleCheckbox
                    className="mt-1.5"
                    checked={task.checked}
                    status={taskVisualStatus(task)}
                    disabled={
                        pendingTaskIds.includes(task.id) ||
                        task.task_status === 'canceled' ||
                        task.task_status === 'migrated'
                    }
                    ariaLabel={t(
                        'tasks_index.toggle_task_aria',
                        'Toggle task :task',
                    ).replace(':task', task.content || String(task.id))}
                    onCheckedChange={() => toggleTaskChecked(task)}
                />
                <div className="min-w-0 flex-1 pt-[1px]">
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
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
                                </div>
                                {hasChildren ? (
                                    <button
                                        type="button"
                                        onClick={() => toggleExpandedTask(task.id)}
                                        className="mt-[2px] inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                                        aria-label={
                                            isExpanded
                                                ? t(
                                                      'tasks_index.collapse_children',
                                                      'Collapse nested items',
                                                  )
                                                : t(
                                                      'tasks_index.expand_children',
                                                      'Expand nested items',
                                                  )
                                        }
                                    >
                                        {isExpanded ? (
                                            <ChevronDown className="size-3.5" />
                                        ) : (
                                            <ChevronRight className="size-3.5" />
                                        )}
                                    </button>
                                ) : null}
                            </div>
                            {renderTaskMetadataAndPath(task, options)}
                        </div>
                    </div>
                    {hasChildren ? (
                        <div
                            className={cn(
                                'grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out',
                                isExpanded
                                    ? 'mt-1 ml-2 grid-rows-[1fr] opacity-100'
                                    : 'mt-0 ml-0 grid-rows-[0fr] opacity-0',
                            )}
                        >
                            <div className="overflow-hidden">
                                {renderTaskChildren(task.children ?? [], 1)}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
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
                const selectable = descendants.filter((d) => !d.startsWith('__j_'));
                return selectable.length > 0 && selectable.every((childId) => selectedNoteScopeSet.has(childId));
            })
            .sort((a, b) => (noteDepthById.get(a) ?? 0) - (noteDepthById.get(b) ?? 0));

        const coveredIds = new Set<string>();
        for (const parentId of parentCandidates) {
            const descendants = descendantIdsById.get(parentId) ?? [];
            const selectableDescendants = descendants.filter((d) => !d.startsWith('__j_'));
            const subtreeIds = [parentId, ...selectableDescendants];
            if (subtreeIds.some((id) => coveredIds.has(id))) {
                continue;
            }

            subtreeIds.forEach((id) => coveredIds.add(id));
            pills.push({
                key: `parent:${parentId}`,
                label: `${noteTitleById.get(parentId) ?? t('tasks_index.untitled_task', 'Untitled task')} (${selectableDescendants.length})`,
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
    const activeFilterPills = useMemo(() => {
        const pills: Array<{ key: string; label: string }> = [];

        selectionPills.forEach((pill, index) => {
            pills.push({
                key: `scope-${pill.key}-${index}`,
                label: pill.label,
            });
        });

        const hasNonDefaultStatus =
            localFilters.status.length !== 1 || localFilters.status[0] !== 'open';
        if (hasNonDefaultStatus) {
            statusSelectionLabels.forEach((label, index) => {
                pills.push({
                    key: `status-${label}-${index}`,
                    label,
                });
            });
        }

        if (hasDateFilterSelection) {
            pills.push({
                key: 'period',
                label: formatDateRangeLabel(),
            });
        }

        if (localFilters.group_by !== 'none') {
            pills.push({
                key: 'grouping',
                label: groupingSelectionLabel,
            });
        }

        if (localFilters.q.trim() !== '') {
            pills.push({
                key: 'search',
                label: localFilters.q.trim(),
            });
        }

        return pills;
    }, [
        formatDateRangeLabel,
        groupingSelectionLabel,
        hasDateFilterSelection,
        localFilters.group_by,
        localFilters.q,
        localFilters.status,
        selectionPills,
        statusSelectionLabels,
    ]);
    const visibleActiveFilterPills = activeFilterPills.slice(0, 4);
    const hiddenActiveFilterPillCount = Math.max(
        0,
        activeFilterPills.length - visibleActiveFilterPills.length,
    );

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

    const toggleNoteScopeWithDescendants = (id: string) => {
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

    const renderNoteTreeNode = (node: NoteTreeNode, depthOffset = 0) => {
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
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn('h-6 px-2 text-xs', allSelectableSelected && 'text-primary')}
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

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-0 p-4 pt-2 md:p-6">
                <section className="mx-auto w-full max-w-3xl rounded-xl bg-card p-4 pt-3 md:p-6">
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                                <h1 className="text-2xl font-semibold leading-none md:text-3xl">
                                    {t('tasks_index.heading', 'Tasks')}
                                </h1>
                                <span className="shrink-0 text-[11px] leading-none text-muted-foreground md:text-sm">
                                    {resultsCountLabel}
                                </span>
                            </div>
                            {activeFilterPreset ? (
                                <div className="mt-1.5 flex min-w-0 items-center">
                                    <span className="inline-flex min-w-0 items-center gap-1 rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                        <Bookmark className="h-3 w-3 shrink-0" />
                                        <span className="truncate">
                                            {activeFilterPreset.name}
                                        </span>
                                        <button
                                            type="button"
                                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                                            onClick={clearAppliedPreset}
                                            aria-label={t(
                                                'tasks_index.clear_filter_preset',
                                                'Clear preset filter',
                                            )}
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    </span>
                                </div>
                            ) : null}
                            {activeFilterPills.length > 0 ? (
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1 md:hidden">
                                    {visibleActiveFilterPills.map((pill) => (
                                        <span
                                            key={pill.key}
                                            className="inline-flex max-w-[220px] items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                                        >
                                            <span className="truncate">{pill.label}</span>
                                        </span>
                                    ))}
                                    {hiddenActiveFilterPillCount > 0 ? (
                                        <span className="inline-flex items-center rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                            +{hiddenActiveFilterPillCount}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-1.5">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="h-10 rounded-full border-0 bg-muted px-3 text-muted-foreground hover:bg-muted/80 hover:text-foreground md:h-8"
                                        aria-label={t(
                                            'tasks_index.filter_presets_menu',
                                            'Filter presets',
                                        )}
                                    >
                                        <Bookmark className="h-4 w-4" />
                                        <span className="text-xs font-medium md:text-[11px]">
                                            {t('tasks_index.filter_presets_label', 'Preset filters')}
                                        </span>
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-72">
                                    {favoriteFilterPresets.length > 0 ? (
                                        <>
                                            <DropdownMenuLabel>
                                                {t(
                                                    'tasks_index.favorite_filter_presets',
                                                    'Favorites',
                                                )}
                                            </DropdownMenuLabel>
                                            {favoriteFilterPresets.map((preset) => (
                                                <DropdownMenuItem
                                                    key={preset.id}
                                                    onClick={() =>
                                                        applyPreset(preset)
                                                    }
                                                    className="gap-2"
                                                >
                                                    <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                                                    <span className="truncate">
                                                        {preset.name}
                                                    </span>
                                                </DropdownMenuItem>
                                            ))}
                                            <DropdownMenuSeparator />
                                        </>
                                    ) : null}

                                    <DropdownMenuItem onClick={openSavePresetDialog} className="gap-2">
                                        <Bookmark className="h-3.5 w-3.5" />
                                        {t(
                                            'tasks_index.save_filter_preset',
                                            'Save filter',
                                        )}
                                    </DropdownMenuItem>
                                    {activeFilterPreset ? (
                                        <DropdownMenuItem
                                            onClick={() => setDefaultPreset(activeFilterPreset)}
                                            className="gap-2"
                                        >
                                            <Home className="h-3.5 w-3.5" />
                                            {activeFilterPreset.default
                                                ? t(
                                                    'tasks_index.unset_default_filter',
                                                    'Remove as default',
                                                )
                                                : t(
                                                    'tasks_index.set_default_filter',
                                                    'Set as default',
                                                )}
                                        </DropdownMenuItem>
                                    ) : null}
                                    <DropdownMenuItem asChild className="gap-2">
                                        <Link href="/settings/task-filters">
                                            <Settings2 className="h-3.5 w-3.5" />
                                            {t(
                                                'tasks_index.manage_filter_presets',
                                                'Manage filters',
                                            )}
                                        </Link>
                                    </DropdownMenuItem>

                                    {nonFavoriteFilterPresets.length > 0 ? (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuSub>
                                                <DropdownMenuSubTrigger>
                                                    {t(
                                                        'tasks_index.saved_filter_presets',
                                                        'Other saved filters',
                                                    )}
                                                </DropdownMenuSubTrigger>
                                                <DropdownMenuSubContent className="w-64">
                                                    {nonFavoriteFilterPresets.map((preset) => (
                                                        <DropdownMenuItem
                                                            key={preset.id}
                                                            onClick={() =>
                                                                applyPreset(
                                                                    preset,
                                                                )
                                                            }
                                                        >
                                                            <span className="truncate">
                                                                {preset.name}
                                                            </span>
                                                        </DropdownMenuItem>
                                                    ))}
                                                </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                        </>
                                    ) : null}
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-10 w-10 rounded-full border-0 bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground md:hidden"
                                onClick={() =>
                                    setMobileFiltersOpen((current) => !current)
                                }
                                aria-label={t(
                                    'tasks_index.toggle_filters',
                                    'Toggle filters',
                                )}
                                aria-pressed={mobileFiltersOpen}
                            >
                                <Filter className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>

                    <div
                        className={cn(
                            'mt-4 space-y-3',
                            mobileFiltersOpen ? 'block' : 'hidden md:block',
                        )}
                    >
                        <form
                            className="flex items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                applyFilters({ q: searchInput.trim() }, true);
                            }}
                        >
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={searchInput}
                                    onChange={(event) =>
                                        setSearchInput(event.target.value)
                                    }
                                    placeholder={t(
                                        'tasks_index.search_placeholder',
                                        'Search tasks, notes, parents...',
                                    )}
                                    className="pl-8"
                                />
                            </div>
                            <Button type="submit" variant="secondary" size="sm">
                                {t('tasks_index.apply', 'Apply')}
                            </Button>
                            {localFilters.q.trim() !== '' ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setSearchInput('');
                                        applyFilters({ q: '' }, true);
                                    }}
                                >
                                    {t(
                                        'tasks_index.clear_selection',
                                        'Clear selection',
                                    )}
                                </Button>
                            ) : null}
                        </form>
                        <p className="text-xs text-muted-foreground">
                            {t(
                                'tasks_index.search_auto_hint',
                                `Auto-search from ${minSearchChars} characters.`,
                            )}
                        </p>
                        <div className="grid grid-cols-1 gap-3 md:flex md:items-start md:justify-between md:gap-4">
                            <Popover>
                                <div className="min-w-0">
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center justify-between gap-1 whitespace-nowrap text-sm font-medium text-foreground/90 hover:text-foreground"
                                        >
                                            <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                                                <span className="truncate">
                                                    {t('tasks_index.workspace_note_picker_trigger', 'Workspaces & notes')}
                                                </span>
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
                                <div className="min-w-0">
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className="inline-flex items-center justify-between gap-1 whitespace-nowrap text-sm font-medium text-foreground/90 hover:text-foreground"
                                        >
                                            <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap">
                                                <span className="truncate">
                                                    {t('tasks_index.grouping_label', 'Grouping')}
                                                </span>
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

                    </div>
                </section>

                <Dialog open={savePresetOpen} onOpenChange={setSavePresetOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>
                                {t(
                                    'tasks_index.save_filter_preset',
                                    'Save filter',
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                {t(
                                    'tasks_index.save_filter_preset_description',
                                    'Save current filters for quick access.',
                                )}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="task-filter-preset-name">
                                    {t(
                                        'tasks_index.filter_preset_name',
                                        'Name',
                                    )}
                                </Label>
                                <Input
                                    id="task-filter-preset-name"
                                    value={presetName}
                                    onChange={(event) =>
                                        setPresetName(event.target.value)
                                    }
                                    placeholder={t(
                                        'tasks_index.filter_preset_name_placeholder',
                                        'My filter',
                                    )}
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Checkbox
                                    checked={presetFavorite}
                                    onCheckedChange={(checked) =>
                                        setPresetFavorite(checked === true)
                                    }
                                />
                                <span>
                                    {t(
                                        'tasks_index.filter_preset_favorite',
                                        'Mark as favorite',
                                    )}
                                </span>
                            </label>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setSavePresetOpen(false)}
                                disabled={presetProcessing}
                            >
                                {t('note_actions.cancel', 'Cancel')}
                            </Button>
                            <Button
                                type="button"
                                onClick={saveCurrentFiltersPreset}
                                disabled={
                                    presetProcessing ||
                                    presetName.trim() === ''
                                }
                            >
                                {t(
                                    'tasks_index.save_filter_preset',
                                    'Save filter',
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

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
                                ? tasks.data.map((task) => renderTaskRow(task))
                                : localFilters.group_by === 'date'
                                  ? groupedTasksByDate.map((group) => (
                                      <div key={group.key} className="space-y-1.5">
                                          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                              {formatGroupDate(group.date)}
                                          </h3>
                                          <div className="space-y-0.5">
                                              {group.tasks.map((task) =>
                                                  renderTaskRow(
                                                      task,
                                                      `${group.key}-${task.id}-${task.position}`,
                                                  ),
                                              )}
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
                                              {group.tasks.map((task) =>
                                                  renderTaskRow(task, task.id, {
                                                      showPath: false,
                                                  }),
                                              )}
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
            </div>
        </AppLayout>
    );
}
