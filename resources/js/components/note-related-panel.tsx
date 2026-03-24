import { Link, router, usePage, useRemember } from '@inertiajs/react';
import { ArrowRightToLine, Ban, Ellipsis, FileText } from 'lucide-react';
import { resolveTaskCheckboxStatus } from '@/lib/task-status-icons';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TaskInlineContent } from '@/components/task-inline-content';
import type { TaskRenderFragment } from '@/components/task-inline-content';
import { TaskToggleCheckbox } from '@/components/task-toggle-checkbox';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type RelatedTaskItem = {
    id: number;
    note_id: string;
    block_id: string | null;
    position: number;
    checked: boolean;
    task_status?:
        | 'canceled'
        | 'assigned'
        | 'in_progress'
        | 'migrated'
        | 'deferred'
        | 'starred'
        | 'backlog'
        | null;
    backlog_promoted_at?: string | null;
    content: string;
    render_fragments: TaskRenderFragment[];
    due_date: string | null;
    deadline_date: string | null;
    note: {
        id: string;
        title: string;
        href: string;
    };
};

type BacklinkItem = {
    id: string;
    block_id: string;
    excerpt: string;
    render_fragments: TaskRenderFragment[];
    note: {
        id: string;
        title: string;
        href: string;
    };
    href: string;
};

type NoteRelatedPanelProps = {
    noteId: string;
    relatedTasks: RelatedTaskItem[];
    backlinks: BacklinkItem[];
    language: 'nl' | 'en';
};

type NoteRelatedPanelPlaceholderProps = {
    language: 'nl' | 'en';
};

export function NoteRelatedPanelPlaceholder({
    language,
}: NoteRelatedPanelPlaceholderProps) {
    const relatedTitle = language === 'en' ? 'Related' : 'Gerelateerd';
    const relatedTasksTitle = language === 'en' ? 'Tasks' : 'Taken';
    const backlinksTitle = language === 'en' ? 'Backlinks' : 'Backlinks';

    return (
        <section className="editor-ui-font mb-0 rounded-md bg-muted/20 px-8 pt-4 pb-2 transition-colors duration-200 md:mb-2 md:px-2 md:py-2">
            <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-[0.78em] font-bold tracking-wide text-muted-foreground uppercase md:font-semibold">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>{relatedTitle}</span>
                </span>
            </div>

            <div className="pt-2 pl-0 md:pl-4">
                <div className="flex items-center gap-1.5 text-[0.78em] font-semibold tracking-wide text-muted-foreground uppercase">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>{relatedTasksTitle}</span>
                </div>
                <div className="space-y-2 pt-2 pl-2 md:pl-5">
                    <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-52 animate-pulse rounded bg-muted" />
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-[0.78em] font-semibold tracking-wide text-muted-foreground uppercase">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>{backlinksTitle}</span>
                </div>
                <div className="space-y-2 pt-2 pl-2 md:pl-5">
                    <div className="h-3 w-44 animate-pulse rounded bg-muted" />
                </div>
            </div>
        </section>
    );
}

export function NoteRelatedPanel({
    noteId,
    relatedTasks,
    backlinks,
    language,
}: NoteRelatedPanelProps) {
    const pageProps = usePage().props as {
        currentWorkspace?: {
            is_migrated_source?: boolean;
        } | null;
    };
    const workspaceReadOnly = pageProps.currentWorkspace?.is_migrated_source === true;
    const isOpenTask = (task: RelatedTaskItem) =>
        task.checked !== true &&
        task.task_status !== 'canceled' &&
        task.task_status !== 'migrated';
    const isMobile = useIsMobile();
    const hasOpenRelatedTasks = relatedTasks.some((task) => isOpenTask(task));
    const [panelOpen, setPanelOpen] = useRemember(
        !isMobile && hasOpenRelatedTasks,
        `note-related-panel:${noteId}:panel-open`,
    );
    const [tasksOpen, setTasksOpen] = useRemember(
        !isMobile && hasOpenRelatedTasks,
        `note-related-panel:${noteId}:tasks-open`,
    );
    const [backlinksOpen, setBacklinksOpen] = useRemember(
        false,
        `note-related-panel:${noteId}:backlinks-open`,
    );
    const [onlyOpenTasks, setOnlyOpenTasks] = useRemember(
        true,
        `note-related-panel:${noteId}:only-open`,
    );
    const [taskItems, setTaskItems] = useState(relatedTasks);
    const [stickyVisibleTaskIds, setStickyVisibleTaskIds] = useState<number[]>([]);
    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);
    const [openTaskGroups, setOpenTaskGroups] = useState<Record<string, boolean>>({});
    const [openBacklinkGroups, setOpenBacklinkGroups] = useState<
        Record<string, boolean>
    >({});
    const longPressTimerRef = useRef<number | null>(null);
    const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
    const LONG_PRESS_DURATION_MS = 480;
    const LONG_PRESS_MOVE_CANCEL_PX = 12;

    const relatedTitle = language === 'en' ? 'Related' : 'Gerelateerd';
    const relatedTasksTitle = language === 'en' ? 'Tasks' : 'Taken';
    const backlinksTitle = language === 'en' ? 'Backlinks' : 'Backlinks';
    const tasksEmptyText =
        language === 'en'
            ? 'No related tasks found.'
            : 'Geen gerelateerde taken gevonden.';

    const openCount = useMemo(
        () => taskItems.filter((task) => isOpenTask(task)).length,
        [taskItems],
    );

    const visibleTaskItems = useMemo(
        () =>
            onlyOpenTasks
                ? taskItems.filter(
                      (task) =>
                          isOpenTask(task) ||
                          stickyVisibleTaskIds.includes(task.id),
                  )
                : taskItems,
        [onlyOpenTasks, stickyVisibleTaskIds, taskItems],
    );

    const visibleGroupedTaskItems = useMemo(() => {
        const groups = new Map<
            string,
            {
                note: RelatedTaskItem['note'];
                tasks: RelatedTaskItem[];
            }
        >();

        visibleTaskItems.forEach((task) => {
            const key = task.note.id;
            const existing = groups.get(key);
            if (existing) {
                existing.tasks.push(task);
                return;
            }

            groups.set(key, {
                note: task.note,
                tasks: [task],
            });
        });

        return Array.from(groups.values());
    }, [visibleTaskItems]);

    const groupedBacklinks = useMemo(() => {
        const groups = new Map<
            string,
            {
                note: BacklinkItem['note'];
                backlinks: BacklinkItem[];
            }
        >();

        backlinks.forEach((item) => {
            const key = item.note.id;
            const existing = groups.get(key);
            if (existing) {
                existing.backlinks.push(item);
                return;
            }

            groups.set(key, {
                note: item.note,
                backlinks: [item],
            });
        });

        return Array.from(groups.values());
    }, [backlinks]);

    const doneOrCanceledCount = taskItems.length - openCount;
    const taskCounterLabel = `${doneOrCanceledCount}/${taskItems.length}`;
    const relatedItemsCount = taskItems.length + backlinks.length;
    const showTasksSection = taskItems.length > 0;
    const showBacklinksSection = backlinks.length > 0;

    const clearLongPressTimer = useCallback(() => {
        if (longPressTimerRef.current !== null) {
            window.clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    const handleTaskRowPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!isMobile || event.pointerType !== 'touch') {
            return;
        }

        const target = event.target as HTMLElement | null;
        if (
            target?.closest(
                'button,a,input,textarea,select,[role="menuitem"],[data-no-long-press-context]',
            )
        ) {
            return;
        }

        clearLongPressTimer();
        longPressStartRef.current = { x: event.clientX, y: event.clientY };
        const row = event.currentTarget;

        longPressTimerRef.current = window.setTimeout(() => {
            row.dispatchEvent(
                new MouseEvent('contextmenu', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    button: 2,
                    buttons: 2,
                    clientX: event.clientX,
                    clientY: event.clientY,
                }),
            );
            clearLongPressTimer();
            longPressStartRef.current = null;
        }, LONG_PRESS_DURATION_MS);
    }, [clearLongPressTimer, isMobile]);

    const handleTaskRowPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!isMobile || event.pointerType !== 'touch') {
            return;
        }

        const start = longPressStartRef.current;
        if (!start) {
            return;
        }

        if (
            Math.abs(event.clientX - start.x) > LONG_PRESS_MOVE_CANCEL_PX ||
            Math.abs(event.clientY - start.y) > LONG_PRESS_MOVE_CANCEL_PX
        ) {
            clearLongPressTimer();
            longPressStartRef.current = null;
        }
    }, [clearLongPressTimer, isMobile]);

    const handleTaskRowPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!isMobile || event.pointerType !== 'touch') {
            return;
        }

        clearLongPressTimer();
        longPressStartRef.current = null;
    }, [clearLongPressTimer, isMobile]);

    useEffect(() => {
        return () => {
            clearLongPressTimer();
        };
    }, [clearLongPressTimer]);

    if (!showTasksSection && !showBacklinksSection) {
        return null;
    }

    const toggleTask = (task: RelatedTaskItem) => {
        if (workspaceReadOnly) {
            return;
        }

        if (pendingTaskIds.includes(task.id)) {
            return;
        }

        const isBacklogPromotion =
            task.task_status === 'backlog' && task.checked !== true;
        const nextChecked = isBacklogPromotion ? false : !task.checked;
        setPendingTaskIds((current) => [...current, task.id]);

        router.patch(
            '/tasks/checked',
            {
                note_id: task.note_id,
                block_id: task.block_id,
                position: task.position,
                checked: nextChecked,
                promote_backlog: isBacklogPromotion,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onSuccess: () => {
                    setTaskItems((current) =>
                        current.map((item) =>
                            item.id === task.id
                                ? {
                                      ...item,
                                      checked: nextChecked,
                                      task_status: isBacklogPromotion
                                          ? null
                                          : item.task_status,
                                      backlog_promoted_at: isBacklogPromotion
                                          ? new Date().toISOString()
                                          : item.backlog_promoted_at ?? null,
                                  }
                                : item,
                        ),
                    );
                    setStickyVisibleTaskIds((current) =>
                        current.includes(task.id) ? current : [...current, task.id],
                    );
                },
                onError: () => {
                    toast.error(
                        language === 'en'
                            ? 'Failed to update task status.'
                            : 'Bijwerken van taakstatus mislukt.',
                    );
                },
                onFinish: () => {
                    setPendingTaskIds((current) =>
                        current.filter((taskId) => taskId !== task.id),
                    );
                },
            },
        );
    };

    const cancelTask = (task: RelatedTaskItem) => {
        if (workspaceReadOnly || pendingTaskIds.includes(task.id)) {
            return;
        }

        setPendingTaskIds((current) => [...current, task.id]);

        router.patch(
            '/tasks/cancel',
            {
                note_id: task.note_id,
                block_id: task.block_id,
                position: task.position,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onSuccess: () => {
                    setTaskItems((current) =>
                        current.map((item) =>
                            item.id === task.id
                                ? { ...item, task_status: 'canceled', checked: false }
                                : item,
                        ),
                    );
                    setStickyVisibleTaskIds((current) =>
                        current.includes(task.id) ? current : [...current, task.id],
                    );
                },
                onError: () => {
                    toast.error(
                        language === 'en'
                            ? 'Failed to cancel task.'
                            : 'Annuleren van taak mislukt.',
                    );
                },
                onFinish: () => {
                    setPendingTaskIds((current) =>
                        current.filter((taskId) => taskId !== task.id),
                    );
                },
            },
        );
    };

    const migrateToCurrentNote = (task: RelatedTaskItem) => {
        if (workspaceReadOnly || pendingTaskIds.includes(task.id)) {
            return;
        }

        setPendingTaskIds((current) => [...current, task.id]);

        router.post(
            '/tasks/migrate',
            {
                source_note_id: task.note_id,
                block_id: task.block_id,
                position: task.position,
                target_note_id: noteId,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onSuccess: () => {
                    setTaskItems((current) =>
                        current.map((item) =>
                            item.id === task.id
                                ? { ...item, task_status: 'migrated', checked: false }
                                : item,
                        ),
                    );
                    setStickyVisibleTaskIds((current) =>
                        current.includes(task.id) ? current : [...current, task.id],
                    );
                },
                onError: () => {
                    toast.error(
                        language === 'en'
                            ? 'Failed to migrate task.'
                            : 'Verplaatsen van taak mislukt.',
                    );
                },
                onFinish: () => {
                    setPendingTaskIds((current) =>
                        current.filter((taskId) => taskId !== task.id),
                    );
                },
            },
        );
    };

    const openTaskInNote = (task: RelatedTaskItem) => {
        if (!task.block_id) {
            return;
        }

        const targetUrl = new URL(task.note.href, window.location.origin);
        targetUrl.hash = task.block_id;

        const currentUrl = new URL(window.location.href);
        const targetPathWithHash = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;

        if (currentUrl.pathname === targetUrl.pathname) {
            window.history.replaceState(window.history.state, '', targetPathWithHash);
            const element = document.getElementById(task.block_id);
            element?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            return;
        }

        router.get(
            targetPathWithHash,
            {},
            {
                preserveState: false,
                preserveScroll: false,
                replace: false,
            },
        );
    };

    const openBacklinkInNote = (item: BacklinkItem) => {
        const targetUrl = new URL(item.href, window.location.origin);
        const blockId = targetUrl.hash.replace(/^#/, '');
        if (blockId === '') {
            return;
        }

        const currentUrl = new URL(window.location.href);
        const targetPathWithHash = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;

        if (currentUrl.pathname === targetUrl.pathname) {
            window.history.replaceState(window.history.state, '', targetPathWithHash);
            const element = document.getElementById(blockId);
            element?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
            return;
        }

        router.get(
            targetPathWithHash,
            {},
            {
                preserveState: false,
                preserveScroll: false,
                replace: false,
            },
        );
    };

    return (
        <section
            className={cn(
                'editor-ui-font mb-0 rounded-md px-8 pt-4 pb-2 transition-colors duration-200 md:mb-2 md:px-2 md:py-2',
                panelOpen ? 'bg-muted/30' : 'bg-transparent',
            )}
        >
            <Collapsible
                open={panelOpen}
                onOpenChange={(open) => {
                    setPanelOpen(open);
                    if (open && isMobile && relatedTasks.length > 0) {
                        setTasksOpen(true);
                    }
                }}
            >
                <div className="flex items-center justify-between gap-2">
                    <CollapsibleTrigger asChild>
                        <button type="button" className="flex flex-1 items-center text-left">
                            <span className="flex items-center gap-1.5 text-[0.78em] font-bold tracking-wide text-muted-foreground uppercase md:font-semibold">
                                {panelOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                )}
                                <span>
                                    {relatedTitle} ({relatedItemsCount})
                                </span>
                            </span>
                        </button>
                    </CollapsibleTrigger>
                </div>

                <CollapsibleContent className="pt-2 pl-0 md:pl-4">
                    {showTasksSection ? (
                        <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
                            <div className="flex items-center justify-between gap-2">
                                <CollapsibleTrigger asChild>
                                    <button type="button" className="flex flex-1 items-center text-left">
                                        <span className="flex items-center gap-1.5 text-[0.78em] font-semibold tracking-wide text-muted-foreground uppercase">
                                            {tasksOpen ? (
                                                <ChevronDown className="h-3.5 w-3.5" />
                                            ) : (
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            )}
                                            <span>
                                                {relatedTasksTitle} ({taskCounterLabel})
                                            </span>
                                        </span>
                                    </button>
                                </CollapsibleTrigger>
                                {doneOrCanceledCount > 0 ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-[0.78em] text-muted-foreground">
                                            {language === 'en' ? 'Only open' : 'Alleen open'}
                                        </span>
                                        <Switch
                                            checked={onlyOpenTasks}
                                            onCheckedChange={setOnlyOpenTasks}
                                            className="h-4 w-7 data-[state=checked]:bg-zinc-400 data-[state=unchecked]:bg-zinc-300 [&>span]:h-3 [&>span]:w-3"
                                            aria-label={
                                                language === 'en'
                                                    ? 'Only open tasks'
                                                    : 'Alleen open taken'
                                            }
                                        />
                                    </div>
                                ) : null}
                            </div>

                            <CollapsibleContent className="pt-2 pl-2 md:pl-5">
                                {visibleTaskItems.length === 0 ? (
                                    <div className="px-1 pb-2 text-[0.78em] text-muted-foreground">
                                        {tasksEmptyText}
                                    </div>
                                ) : (
                                    <div className="space-y-1 pb-2">
                                        {visibleGroupedTaskItems.map((group) => {
                                            const groupOpen =
                                                openTaskGroups[group.note.id] ?? true;

                                            return (
                                                <Collapsible
                                                    key={group.note.id}
                                                    open={groupOpen}
                                                    onOpenChange={(open) =>
                                                        setOpenTaskGroups((current) => ({
                                                            ...current,
                                                            [group.note.id]: open,
                                                        }))
                                                    }
                                                    className="space-y-0.5 py-1.5 md:px-2"
                                                >
                                                    <CollapsibleTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="flex w-full items-center gap-1.5 text-left"
                                                        >
                                                            {groupOpen ? (
                                                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                            ) : (
                                                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                            )}
                                                            <Link
                                                                href={group.note.href}
                                                                className="text-[0.95em] font-semibold text-muted-foreground underline-offset-2 hover:underline"
                                                                onClick={(event) =>
                                                                    event.stopPropagation()
                                                                }
                                                            >
                                                                {group.note.title}
                                                            </Link>
                                                        </button>
                                                    </CollapsibleTrigger>

                                                    <CollapsibleContent className="pl-3 md:pl-5">
                                                        {group.tasks.map((task) => (
                                                            <ContextMenu key={`${task.id}-${task.position}`}>
                                                                <ContextMenuTrigger asChild>
                                                                    <article
                                                                        className="py-1 md:pl-1"
                                                                        onDoubleClick={() =>
                                                                            openTaskInNote(task)
                                                                        }
                                                                        onPointerDown={handleTaskRowPointerDown}
                                                                        onPointerMove={handleTaskRowPointerMove}
                                                                        onPointerUp={handleTaskRowPointerEnd}
                                                                        onPointerCancel={handleTaskRowPointerEnd}
                                                                    >
                                                                        <div className="flex items-start gap-4">
                                                                            <TaskToggleCheckbox
                                                                                className="mt-1"
                                                                                checked={task.checked}
                                                                                status={resolveTaskCheckboxStatus(task.task_status, task.checked)}
                                                                                disabled={
                                                                                    workspaceReadOnly ||
                                                                                    pendingTaskIds.includes(
                                                                                        task.id,
                                                                                    ) ||
                                                                                    task.task_status ===
                                                                                        'canceled' ||
                                                                                    task.task_status ===
                                                                                        'migrated'
                                                                                }
                                                                                ariaLabel={`Toggle task ${task.content || task.id}`}
                                                                                onCheckedChange={() =>
                                                                                    toggleTask(task)
                                                                                }
                                                                            />
                                                                            <div className="min-w-0 flex-1 pt-px">
                                                                                <p
                                                                                    className={cn(
                                                                                        'text-base leading-[1.62]',
                                                                                        task.task_status ===
                                                                                            'canceled' &&
                                                                                            'line-through opacity-70',
                                                                                        task.task_status ===
                                                                                            'migrated' &&
                                                                                            'opacity-70',
                                                                                        task.task_status !==
                                                                                            'canceled' &&
                                                                                            task.task_status !==
                                                                                                'migrated' &&
                                                                                            task.checked &&
                                                                                            'line-through opacity-70',
                                                                                    )}
                                                                                >
                                                                                    <TaskInlineContent
                                                                                        fragments={
                                                                                            task
                                                                                                .render_fragments
                                                                                                .length > 0
                                                                                                ? task.render_fragments
                                                                                                : [
                                                                                                      {
                                                                                                          type: 'text',
                                                                                                          text:
                                                                                                              task.content ||
                                                                                                              (language ===
                                                                                                              'en'
                                                                                                                  ? 'Untitled task'
                                                                                                                  : 'Naamloze taak'),
                                                                                                      },
                                                                                                  ]
                                                                                        }
                                                                                        language={language}
                                                                                        canceled={
                                                                                            task.task_status ===
                                                                                            'canceled'
                                                                                        }
                                                                                        className={cn(
                                                                                            'text-[1em] leading-[1.66] font-normal tracking-[-0.01em] md:text-base md:leading-[1.62]',
                                                                                            (task.task_status ===
                                                                                                'canceled' ||
                                                                                                task.task_status ===
                                                                                                    'migrated' ||
                                                                                                task.checked) &&
                                                                                                'task-inline--faded',
                                                                                        )}
                                                                                        priorityStyle="range"
                                                                                        hideStatusTokens
                                                                                        hidePriorityTokens
                                                                                    />
                                                                                </p>
                                                                            </div>
                                                                            {isMobile ? (
                                                                                <DropdownMenu>
                                                                                    <DropdownMenuTrigger asChild>
                                                                                        <button
                                                                                            type="button"
                                                                                            data-no-long-press-context
                                                                                            className="mt-[2px] inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                                            aria-label={language === 'en' ? 'More actions' : 'Meer acties'}
                                                                                        >
                                                                                            <Ellipsis className="size-3.5" />
                                                                                        </button>
                                                                                    </DropdownMenuTrigger>
                                                                                    <DropdownMenuContent align="end">
                                                                                        <DropdownMenuItem
                                                                                            onSelect={() => openTaskInNote(task)}
                                                                                            disabled={!task.block_id}
                                                                                        >
                                                                                            <FileText />
                                                                                            {language === 'en' ? 'Go to task in note' : 'Ga naar taak in notitie'}
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuSeparator />
                                                                                        <DropdownMenuItem
                                                                                            onSelect={() => cancelTask(task)}
                                                                                            disabled={
                                                                                                workspaceReadOnly ||
                                                                                                task.task_status === 'canceled' ||
                                                                                                task.task_status === 'migrated' ||
                                                                                                pendingTaskIds.includes(task.id)
                                                                                            }
                                                                                        >
                                                                                            <Ban />
                                                                                            {language === 'en' ? 'Cancel task' : 'Taak annuleren'}
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuItem
                                                                                            onSelect={() => migrateToCurrentNote(task)}
                                                                                            disabled={
                                                                                                workspaceReadOnly ||
                                                                                                task.task_status === 'migrated' ||
                                                                                                task.task_status === 'canceled' ||
                                                                                                pendingTaskIds.includes(task.id)
                                                                                            }
                                                                                        >
                                                                                            <ArrowRightToLine />
                                                                                            {language === 'en' ? 'Migrate to this note' : 'Verplaatsen naar deze notitie'}
                                                                                        </DropdownMenuItem>
                                                                                    </DropdownMenuContent>
                                                                                </DropdownMenu>
                                                                            ) : null}
                                                                        </div>
                                                                    </article>
                                                                </ContextMenuTrigger>
                                                                <ContextMenuContent>
                                                                    <ContextMenuItem
                                                                        onSelect={() => openTaskInNote(task)}
                                                                        disabled={!task.block_id}
                                                                    >
                                                                        <FileText />
                                                                        {language === 'en' ? 'Go to task in note' : 'Ga naar taak in notitie'}
                                                                    </ContextMenuItem>
                                                                    <ContextMenuSeparator />
                                                                    <ContextMenuItem
                                                                        onSelect={() => cancelTask(task)}
                                                                        disabled={
                                                                            workspaceReadOnly ||
                                                                            task.task_status === 'canceled' ||
                                                                            task.task_status === 'migrated' ||
                                                                            pendingTaskIds.includes(task.id)
                                                                        }
                                                                    >
                                                                        <Ban />
                                                                        {language === 'en' ? 'Cancel task' : 'Taak annuleren'}
                                                                    </ContextMenuItem>
                                                                    <ContextMenuItem
                                                                        onSelect={() => migrateToCurrentNote(task)}
                                                                        disabled={
                                                                            workspaceReadOnly ||
                                                                            task.task_status === 'migrated' ||
                                                                            task.task_status === 'canceled' ||
                                                                            pendingTaskIds.includes(task.id)
                                                                        }
                                                                    >
                                                                        <ArrowRightToLine />
                                                                        {language === 'en' ? 'Migrate to this note' : 'Verplaatsen naar deze notitie'}
                                                                    </ContextMenuItem>
                                                                </ContextMenuContent>
                                                            </ContextMenu>
                                                        ))}
                                                    </CollapsibleContent>
                                                </Collapsible>
                                            );
                                        })}
                                    </div>
                                )}
                            </CollapsibleContent>
                        </Collapsible>
                    ) : null}

                    {showBacklinksSection ? (
                        <Collapsible
                            open={backlinksOpen}
                            onOpenChange={setBacklinksOpen}
                            className={showTasksSection ? 'pt-3' : undefined}
                        >
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between text-left"
                            >
                                <span className="flex items-center gap-1.5 text-[0.78em] font-semibold tracking-wide text-muted-foreground uppercase">
                                    {backlinksOpen ? (
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                    <span>
                                        {backlinksTitle} ({backlinks.length})
                                    </span>
                                </span>
                            </button>
                        </CollapsibleTrigger>

                        <CollapsibleContent className="pt-2 pl-5">
                            <div className="space-y-1 pb-2">
                                {groupedBacklinks.map((group) => {
                                    const groupOpen =
                                        openBacklinkGroups[group.note.id] ?? true;

                                    return (
                                        <Collapsible
                                            key={group.note.id}
                                            open={groupOpen}
                                            onOpenChange={(open) =>
                                                setOpenBacklinkGroups((current) => ({
                                                    ...current,
                                                    [group.note.id]: open,
                                                }))
                                            }
                                            className="space-y-0.5 py-1.5 md:px-2"
                                        >
                                            <CollapsibleTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-1.5 text-left"
                                                >
                                                    {groupOpen ? (
                                                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                                    ) : (
                                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                                                    )}
                                                    <span className="text-[0.95em] font-semibold text-muted-foreground">
                                                        {group.note.title}
                                                    </span>
                                                </button>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent className="pl-3 md:pl-5">
                                                <ul className="space-y-1 pb-1">
                                                    {group.backlinks.map((item) => (
                                                        <li
                                                            key={item.id}
                                                            className="py-1 md:pl-1"
                                                            onDoubleClick={() =>
                                                                openBacklinkInNote(item)
                                                            }
                                                        >
                                                            <div className="flex items-start gap-4">
                                                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center">
                                                                    <span
                                                                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground/80"
                                                                        aria-hidden="true"
                                                                    />
                                                                </span>
                                                                <p className="min-w-0 flex-1 text-base leading-[1.62]">
                                                                    <TaskInlineContent
                                                                        fragments={
                                                                            item
                                                                                .render_fragments
                                                                                .length > 0
                                                                                ? item.render_fragments
                                                                                : [
                                                                                      {
                                                                                          type: 'text',
                                                                                          text:
                                                                                              item.excerpt,
                                                                                      },
                                                                                  ]
                                                                        }
                                                                        language={language}
                                                                    />
                                                                </p>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    );
                                })}
                            </div>
                        </CollapsibleContent>
                        </Collapsible>
                    ) : null}
                </CollapsibleContent>
            </Collapsible>
        </section>
    );
}
