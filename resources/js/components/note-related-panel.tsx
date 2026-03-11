import { Link, router } from '@inertiajs/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { TaskInlineContent } from '@/components/task-inline-content';
import type { TaskRenderFragment } from '@/components/task-inline-content';
import { TaskToggleCheckbox } from '@/components/task-toggle-checkbox';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
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
    relatedTasks: RelatedTaskItem[];
    backlinks: BacklinkItem[];
    language: 'nl' | 'en';
};

export function NoteRelatedPanel({
    relatedTasks,
    backlinks,
    language,
}: NoteRelatedPanelProps) {
    const isOpenTask = (task: RelatedTaskItem) =>
        task.checked !== true &&
        task.task_status !== 'canceled' &&
        task.task_status !== 'migrated';
    const hasOpenRelatedTasks = relatedTasks.some((task) => isOpenTask(task));
    const [panelOpen, setPanelOpen] = useState(hasOpenRelatedTasks);
    const [tasksOpen, setTasksOpen] = useState(hasOpenRelatedTasks);
    const [backlinksOpen, setBacklinksOpen] = useState(false);
    const [onlyOpenTasks, setOnlyOpenTasks] = useState(true);
    const [taskItems, setTaskItems] = useState(relatedTasks);
    const [stickyVisibleTaskIds, setStickyVisibleTaskIds] = useState<number[]>([]);
    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);
    const [openTaskGroups, setOpenTaskGroups] = useState<Record<string, boolean>>({});
    const [openBacklinkGroups, setOpenBacklinkGroups] = useState<
        Record<string, boolean>
    >({});

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

    if (!showTasksSection && !showBacklinksSection) {
        return null;
    }

    const toggleTask = (task: RelatedTaskItem) => {
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
            <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
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
                                                            <article
                                                                key={`${task.id}-${task.position}`}
                                                                className="py-1 md:pl-1"
                                                                onDoubleClick={() =>
                                                                    openTaskInNote(task)
                                                                }
                                                            >
                                                                <div className="flex items-start gap-4">
                                                                    <TaskToggleCheckbox
                                                                        className="mt-1"
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
                                                                    <div className="min-w-0 flex-1 pt-[1px]">
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
                                                                </div>
                                                            </article>
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
