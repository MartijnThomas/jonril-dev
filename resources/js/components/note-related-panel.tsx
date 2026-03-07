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
import { cn } from '@/lib/utils';

type RelatedTaskItem = {
    id: number;
    note_id: string;
    block_id: string | null;
    position: number;
    checked: boolean;
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
    heading: string | null;
    heading_level: number | null;
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
    const hasOpenRelatedTasks = relatedTasks.some((task) => !task.checked);
    const [panelOpen, setPanelOpen] = useState(hasOpenRelatedTasks);
    const [tasksOpen, setTasksOpen] = useState(hasOpenRelatedTasks);
    const [backlinksOpen, setBacklinksOpen] = useState(false);
    const [taskItems, setTaskItems] = useState(relatedTasks);
    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);

    const relatedTitle = language === 'en' ? 'Related' : 'Gerelateerd';
    const relatedTasksTitle = language === 'en' ? 'Related tasks' : 'Gerelateerde taken';
    const backlinksTitle = language === 'en' ? 'Backlinks' : 'Backlinks';
    const tasksEmptyText =
        language === 'en'
            ? 'No related tasks found.'
            : 'Geen gerelateerde taken gevonden.';
    const backlinksEmptyText =
        language === 'en'
            ? 'No backlinks found.'
            : 'Geen backlinks gevonden.';

    const remainingCount = useMemo(
        () => taskItems.filter((task) => !task.checked).length,
        [taskItems],
    );
    const groupedTaskItems = useMemo(() => {
        const groups = new Map<
            string,
            {
                note: RelatedTaskItem['note'];
                tasks: RelatedTaskItem[];
            }
        >();

        taskItems.forEach((task) => {
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
    }, [taskItems]);
    const closedCount = taskItems.length - remainingCount;
    const taskCounterLabel = `${closedCount}/${taskItems.length}`;
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

    return (
        <section
            className={cn(
                'mb-4 rounded-md px-2 py-1 transition-colors duration-200',
                panelOpen ? 'bg-muted/30' : 'bg-transparent',
            )}
        >
            <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className="flex w-full items-center justify-between text-left"
                    >
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

                <CollapsibleContent className="pt-2 pl-4">
                    <Collapsible open={tasksOpen} onOpenChange={setTasksOpen}>
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between text-left"
                            >
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

                        <CollapsibleContent className="pt-2 pl-5">
                            {taskItems.length === 0 ? (
                                <div className="px-1 pb-2 text-xs text-muted-foreground">
                                    {tasksEmptyText}
                                </div>
                            ) : (
                                <div className="space-y-1 pb-2">
                                    {groupedTaskItems.map((group) => (
                                        <div
                                            key={group.note.id}
                                            className="space-y-0.5 px-2 py-1.5"
                                        >
                                            <Link
                                                href={group.note.href}
                                                className="text-sm font-semibold text-muted-foreground underline-offset-2 hover:underline"
                                            >
                                                {group.note.title}
                                            </Link>
                                            {group.tasks.map((task) => (
                                                <article
                                                    key={`${task.id}-${task.position}`}
                                                    className="py-1 pl-1"
                                                    onDoubleClick={() => openTaskInNote(task)}
                                                >
                                                    <div className="flex items-start gap-4">
                                                        <TaskToggleCheckbox
                                                            className="mt-0.5"
                                                            checked={task.checked}
                                                            disabled={pendingTaskIds.includes(
                                                                task.id,
                                                            )}
                                                            ariaLabel={`Toggle task ${task.content || task.id}`}
                                                            onCheckedChange={() =>
                                                                toggleTask(task)
                                                            }
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p
                                                                className={cn(
                                                                    'text-sm leading-5',
                                                                    task.checked &&
                                                                        'text-muted-foreground line-through',
                                                                )}
                                                            >
                                                                <TaskInlineContent
                                                                    fragments={
                                                                        task.render_fragments
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
                                                                />
                                                            </p>
                                                        </div>
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    ))}
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
                                <ul className="space-y-1 pb-2">
                                    {backlinks.map((item) => (
                                        <li
                                            key={item.id}
                                            className="list-none px-2 py-1.5"
                                        >
                                            <div className="flex items-start gap-4">
                                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center">
                                                    <span
                                                        className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
                                                        aria-hidden="true"
                                                    />
                                                </span>
                                                <div className="min-w-0 flex-1 space-y-1">
                                                    <Link
                                                        href={item.href}
                                                        className="text-sm underline-offset-2 hover:underline"
                                                    >
                                                        {item.note.title}
                                                    </Link>
                                                    {item.heading &&
                                                    item.heading.trim().toLowerCase() !==
                                                        item.note.title
                                                            .trim()
                                                            .toLowerCase() ? (
                                                        <div className="text-xs text-muted-foreground">
                                                            {`${'#'.repeat(Math.max(1, Math.min(6, item.heading_level ?? 1)))} ${item.heading}`}
                                                        </div>
                                                    ) : null}
                                                    <p className="text-sm leading-5 text-muted-foreground">
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
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CollapsibleContent>
                    </Collapsible>
                </CollapsibleContent>
            </Collapsible>
        </section>
    );
}
