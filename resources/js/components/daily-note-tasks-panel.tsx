import { Link, router } from '@inertiajs/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

type DailyTaskItem = {
    id: number;
    note_id: string;
    block_id: string | null;
    position: number;
    checked: boolean;
    task_status: 'canceled' | 'assigned' | 'migrated' | 'deferred' | 'starred' | 'question' | null;
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

type DailyNoteTasksPanelProps = {
    tasks: DailyTaskItem[];
    language: 'nl' | 'en';
};

export function DailyNoteTasksPanel({
    tasks,
    language,
}: DailyNoteTasksPanelProps) {
    const [open, setOpen] = useState(true);
    const [items, setItems] = useState(tasks);
    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);

    useEffect(() => {
        setItems(tasks);
    }, [tasks]);

    const title = language === 'en' ? 'Due Today' : 'Vandaag gepland';
    const emptyText =
        language === 'en'
            ? 'No due or deadline tasks for today.'
            : 'Geen taken met een deadline of due-datum vandaag.';

    const openCount = useMemo(
        () =>
            items.filter(
                (task) =>
                    task.checked !== true &&
                    task.task_status !== 'canceled' &&
                    task.task_status !== 'migrated',
            ).length,
        [items],
    );
    const doneOrCanceledCount = items.length - openCount;
    const counterLabel = `${doneOrCanceledCount}/${items.length}`;

    const toggleTask = (task: DailyTaskItem) => {
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
                    setItems((current) =>
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

    const openTaskInNote = (task: DailyTaskItem) => {
        if (!task.block_id) {
            return;
        }

        const targetUrl = new URL(task.note.href, window.location.origin);
        targetUrl.hash = task.block_id;

        const currentUrl = new URL(window.location.href);
        const targetPathWithHash = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;

        if (currentUrl.pathname === targetUrl.pathname) {
            window.history.replaceState(
                window.history.state,
                '',
                targetPathWithHash,
            );
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
        <Collapsible
            open={open}
            onOpenChange={setOpen}
            className={cn(
                'editor-ui-font mb-4 rounded-md px-2 py-1 transition-colors duration-200',
                open ? 'bg-muted/30' : 'bg-transparent',
            )}
        >
            <CollapsibleTrigger asChild>
                <button
                    type="button"
                    className="flex w-full items-center justify-between text-left"
                >
                    <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {open ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                        )}
                        <span>{title} ({counterLabel})</span>
                    </span>
                </button>
            </CollapsibleTrigger>

            <CollapsibleContent className="pt-2">
                {items.length === 0 ? (
                    <div className="px-1 pb-1 text-xs text-muted-foreground">
                        {emptyText}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {items.map((task) => (
                            <article
                                key={`${task.id}-${task.position}`}
                                className="p-2"
                                onDoubleClick={() => openTaskInNote(task)}
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
                                                  : task.checked
                                                    ? 'completed'
                                                    : 'open'
                                        }
                                        disabled={
                                            pendingTaskIds.includes(task.id) ||
                                            task.task_status === 'canceled' ||
                                            task.task_status === 'migrated'
                                        }
                                        ariaLabel={`Toggle task ${task.content || task.id}`}
                                        onCheckedChange={() => toggleTask(task)}
                                    />
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                'text-base leading-[1.62]',
                                                task.task_status ===
                                                    'canceled' &&
                                                    'line-through opacity-72',
                                                task.task_status ===
                                                    'migrated' &&
                                                    'opacity-72',
                                                task.task_status !==
                                                    'canceled' &&
                                                    task.task_status !==
                                                        'migrated' &&
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
                                                hideStatusTokens
                                                priorityStyle="range"
                                                hidePriorityTokens
                                            />
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <Link
                                                href={task.note.href}
                                                className="underline-offset-2 hover:underline"
                                            >
                                                {task.note.title}
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
