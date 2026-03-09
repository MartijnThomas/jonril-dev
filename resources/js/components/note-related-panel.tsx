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
        | 'migrated'
        | 'deferred'
        | 'starred'
        | 'question'
        | null;
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
    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);
    const [openTaskGroups, setOpenTaskGroups] = useState<Record<string, boolean>>({});
    const [openBacklinkGroups, setOpenBacklinkGroups] = useState<
        Record<string, boolean>
    >({});

    const relatedTitle = language === 'en' ? 'Related' : 'Gerelateerd';
    const relatedTasksTitle = language === 'en' ? 'Related tasks' : 'Gerelateerde taken';
    const backlinksTitle = language === 'en' ? 'Backlinks' : 'Backlinks';
    const tasksEmptyText =
        language === 'en'
            ? 'No related tasks found.'
            : 'Geen gerelateerde taken gevonden.';
    const backlinksEmptyText =
        language === 'en' ? 'No backlinks found.' : 'Geen backlinks gevonden.';

    const openCount = useMemo(
        () => taskItems.filter((task) => isOpenTask(task)).length,
        [taskItems],
    );

    const visibleTaskItems = useMemo(
        () =>
            onlyOpenTasks
                ? taskItems.filter((task) => isOpenTask(task))
                : taskItems,
        [onlyOpenTasks, taskItems],
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

    const toggleTask = (task: RelatedTaskItem) => {
        if (pendingTaskIds.includes(task.id)) {
            return;
        }

        const nextChecked = !task.checked;
        setPendingTaskIds((current) => [...current, task.id]);

        router.patch(
            '/tasks/checked',
            {
                note_id: task.note_id,
                block_id: task.block_id,
                position: task.position,
                checked: nextChecked,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onSuccess: () => {
                    setTaskItems((current) =>
                        current.map((item) =>
                            item.id === task.id
                                ? { ...item, checked: nextChecked }
                                : item,
                        ),
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
                'mb-2 rounded-md px-2 py-2 transition-colors duration-200',
                panelOpen ? 'bg-muted/30' : 'bg-transparent',
            )}
        >
            <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
                <div className="flex items-center justify-between gap-2">
                    <CollapsibleTrigger asChild>
                        <button type="button" className="flex flex-1 items-center text-left">
                            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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

                <CollapsibleContent className="pt-2 pl-4">
                    <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
                        <div className="flex items-center justify-between gap-2">
                            <CollapsibleTrigger asChild>
                                <button type="button" className="flex flex-1 items-center text-left">
                                    <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
                            {taskItems.length > 0 && doneOrCanceledCount > 0 ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">
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

                        <CollapsibleContent className="pt-2 pl-5">
                            {visibleTaskItems.length === 0 ? (
                                <div className="px-1 pb-2 text-xs text-muted-foreground">
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
                                                className="space-y-0.5 px-2 py-1.5"
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
                                                            className="text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline"
                                                            onClick={(event) =>
                                                                event.stopPropagation()
                                                            }
                                                        >
                                                            {group.note.title}
                                                        </Link>
                                                    </button>
                                                </CollapsibleTrigger>

                                                <CollapsibleContent className="pl-5">
                                                    {group.tasks.map((task) => (
                                                        <article
                                                            key={`${task.id}-${task.position}`}
                                                            className="py-1 pl-1"
                                                            onDoubleClick={() =>
                                                                openTaskInNote(task)
                                                            }
                                                        >
                                                            <div className="flex items-start gap-4">
                                                                <TaskToggleCheckbox
                                                                    className="mt-0.5"
                                                                    checked={task.checked}
                                                                    disabled={
                                                                        pendingTaskIds.includes(
                                                                            task.id,
                                                                        ) ||
                                                                        task.task_status ===
                                                                            'canceled'
                                                                    }
                                                                    ariaLabel={`Toggle task ${task.content || task.id}`}
                                                                    onCheckedChange={() =>
                                                                        toggleTask(task)
                                                                    }
                                                                />
                                                                <div className="min-w-0 flex-1">
                                                                    <p
                                                                        className={cn(
                                                                            'text-sm leading-5',
                                                                            task.task_status ===
                                                                                'canceled' &&
                                                                                'line-through task-canceled-strike',
                                                                            task.task_status !==
                                                                                'canceled' &&
                                                                                task.checked &&
                                                                                'line-through opacity-72',
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
                                                                            priorityStyle="range"
                                                                            canceled={
                                                                                task.task_status ===
                                                                                'canceled'
                                                                            }
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

                    <Collapsible
                        open={backlinksOpen}
                        onOpenChange={setBacklinksOpen}
                        className="pt-3"
                    >
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between text-left"
                            >
                                <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
                            {backlinks.length === 0 ? (
                                <div className="px-1 pb-1 text-xs text-muted-foreground">
                                    {backlinksEmptyText}
                                </div>
                            ) : (
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
                                                className="space-y-0.5 px-2 py-1.5"
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
                                                        <span className="text-sm font-semibold text-muted-foreground">
                                                            {group.note.title}
                                                        </span>
                                                    </button>
                                                </CollapsibleTrigger>

                                                <CollapsibleContent className="pl-5">
                                                    <ul className="space-y-1 pb-1">
                                                        {group.backlinks.map((item) => (
                                                            <li
                                                                key={item.id}
                                                                className="py-1 pl-1"
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
                                                                    <p className="min-w-0 flex-1 text-sm leading-5">
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
                            )}
                        </CollapsibleContent>
                    </Collapsible>
                </CollapsibleContent>
            </Collapsible>
        </section>
    );
}
