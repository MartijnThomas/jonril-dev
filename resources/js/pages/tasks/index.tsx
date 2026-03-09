import { Head, Link, router, usePage } from '@inertiajs/react';
import { format, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { ArrowDown, ArrowUp, CalendarIcon, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';
import { TaskInlineContent } from '@/components/task-inline-content';
import type { TaskRenderFragment } from '@/components/task-inline-content';
import { TaskToggleCheckbox } from '@/components/task-toggle-checkbox';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type TaskItem = {
    id: number;
    block_id: string | null;
    position: number;
    checked: boolean;
    task_status: 'canceled' | 'assigned' | 'migrated' | 'deferred' | 'starred' | 'question' | null;
    priority: 'high' | 'medium' | 'normal' | null;
    content: string;
    render_fragments: TaskRenderFragment[];
    due_date: string | null;
    deadline_date: string | null;
    mentions: string[];
    hashtags: string[];
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
};

type PaginatorLink = {
    url: string | null;
    label: string;
    active: boolean;
};

type Filters = {
    q: string;
    workspace_id: string;
    note_scope_id: string;
    mention: string;
    hashtag: string;
    date_from: string;
    date_to: string;
    show_completed: boolean;
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
    noteTreeOptions: { id: string; title: string }[];
};

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Tasks',
        href: '/tasks',
    },
];

export default function TasksIndex({
    tasks,
    filters,
    workspaces,
    noteTreeOptions,
}: Props) {
    const pageProps = usePage().props as {
        auth?: {
            user?: {
                settings?: {
                    language?: string;
                };
            };
        };
    };
    const language =
        pageProps.auth?.user?.settings?.language === 'en' ? 'en' : 'nl';
    const dateLocale = language === 'en' ? enUS : nl;

    const [localFilters, setLocalFilters] = useState<Filters>(filters);
    const [pendingTaskIds, setPendingTaskIds] = useState<number[]>([]);

    const toQuery = (state: Filters) => {
        const query: Record<string, string | number> = {
            sort: state.sort,
            direction: state.direction,
        };

        if (state.q.trim() !== '') query.q = state.q.trim();
        if (state.workspace_id) query.workspace_id = state.workspace_id;
        if (state.note_scope_id) query.note_scope_id = state.note_scope_id;
        if (state.mention.trim() !== '') query.mention = state.mention.trim();
        if (state.hashtag.trim() !== '') query.hashtag = state.hashtag.trim();
        if (state.date_from) query.date_from = state.date_from;
        if (state.date_to) query.date_to = state.date_to;
        if (state.show_completed) query.show_completed = 1;

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
            workspace_id: '',
            note_scope_id: '',
            mention: '',
            hashtag: '',
            date_from: '',
            date_to: '',
            show_completed: false,
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

        const nextChecked = !task.checked;

        updateTaskChecked(task, nextChecked, {
            onSuccess: () => {
                toast.success(
                    nextChecked
                        ? language === 'en'
                            ? 'Task completed.'
                            : 'Taak afgerond.'
                        : language === 'en'
                          ? 'Task reopened.'
                          : 'Taak heropend.',
                    {
                        action: {
                            label:
                                language === 'en' ? 'Undo' : 'Ongedaan maken',
                            onClick: () => {
                                updateTaskChecked(task, task.checked, {
                                    onSuccess: () => {
                                        toast.success(
                                            language === 'en'
                                                ? 'Task change undone.'
                                                : 'Taakwijziging ongedaan gemaakt.',
                                        );
                                    },
                                    onError: () => {
                                        toast.error(
                                            language === 'en'
                                                ? 'Failed to undo task change.'
                                                : 'Ongedaan maken van taakwijziging mislukt.',
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
                    language === 'en'
                        ? 'Failed to update task status.'
                        : 'Bijwerken van taakstatus mislukt.',
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
        if (selectedDateRange.from && selectedDateRange.to) {
            return `${format(selectedDateRange.from, 'PPP', { locale: dateLocale })} - ${format(selectedDateRange.to, 'PPP', { locale: dateLocale })}`;
        }

        if (selectedDateRange.from) {
            return `From ${format(selectedDateRange.from, 'PPP', { locale: dateLocale })}`;
        }

        return 'Date range (due + deadline)';
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Tasks" />

            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
                <section className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h1 className="text-lg font-semibold">Tasks</h1>
                        <span className="text-sm text-muted-foreground">
                            {tasks.total} results
                        </span>
                    </div>

                    <form onSubmit={onSubmit} className="mt-4 space-y-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                            <Input
                                value={localFilters.q}
                                onChange={(event) =>
                                    applyFilters({ q: event.target.value })
                                }
                                placeholder="Search tasks, notes, parents..."
                                className="md:col-span-4"
                            />

                            <Select
                                value={localFilters.workspace_id || '__all__'}
                                onValueChange={(value) =>
                                    applyFilters(
                                        {
                                            workspace_id:
                                                value === '__all__'
                                                    ? ''
                                                    : value,
                                            note_scope_id: '',
                                        },
                                        true,
                                    )
                                }
                            >
                                <SelectTrigger className="md:col-span-2">
                                    <SelectValue placeholder="All workspaces" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">
                                        All workspaces
                                    </SelectItem>
                                    {workspaces.map((workspace) => (
                                        <SelectItem
                                            key={workspace.id}
                                            value={workspace.id}
                                        >
                                            {workspace.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={localFilters.note_scope_id || '__all__'}
                                onValueChange={(value) =>
                                    applyFilters(
                                        {
                                            note_scope_id:
                                                value === '__all__'
                                                    ? ''
                                                    : value,
                                        },
                                        true,
                                    )
                                }
                            >
                                <SelectTrigger className="md:col-span-3">
                                    <SelectValue placeholder="All notes / parents" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">
                                        All notes / parents
                                    </SelectItem>
                                    {noteTreeOptions.map((note) => (
                                        <SelectItem
                                            key={note.id}
                                            value={note.id}
                                        >
                                            {note.title}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="md:col-span-3" />
                        </div>

                        <div className="grid grid-cols-1 gap-2 md:grid-cols-12">
                            <Input
                                value={localFilters.mention}
                                onChange={(event) =>
                                    applyFilters({
                                        mention: event.target.value,
                                    })
                                }
                                placeholder="Mention"
                                className="md:col-span-2"
                            />

                            <Input
                                value={localFilters.hashtag}
                                onChange={(event) =>
                                    applyFilters({
                                        hashtag: event.target.value,
                                    })
                                }
                                placeholder="Hashtag"
                                className="md:col-span-2"
                            />

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="justify-start gap-2 md:col-span-6"
                                    >
                                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                                        <span className="truncate">
                                            {formatDateRangeLabel()}
                                        </span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                    className="w-auto p-0"
                                    align="start"
                                >
                                    <Calendar
                                        mode="range"
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
                                                    date_from: from,
                                                    date_to: to,
                                                },
                                                true,
                                            );
                                        }}
                                        numberOfMonths={2}
                                    />
                                    <div className="border-t p-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                                applyFilters(
                                                    {
                                                        date_from: '',
                                                        date_to: '',
                                                    },
                                                    true,
                                                )
                                            }
                                        >
                                            Clear date range
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                            <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Switch
                                    checked={localFilters.show_completed}
                                    onCheckedChange={(checked) =>
                                        applyFilters(
                                            { show_completed: checked },
                                            true,
                                        )
                                    }
                                />
                                Show completed
                            </label>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={resetFilters}
                                >
                                    Reset
                                </Button>
                                <Button type="submit">Apply</Button>
                            </div>
                        </div>
                    </form>
                </section>

                <section className="rounded-xl border bg-card">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-10">Done</TableHead>
                                <TableHead className="w-[55%] pl-5">
                                    Task
                                </TableHead>
                                <TableHead>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 text-left"
                                        onClick={() => toggleDateSort('due')}
                                    >
                                        Due
                                        {localFilters.sort === 'due' ? (
                                            localFilters.direction === 'asc' ? (
                                                <ArrowUp className="h-3.5 w-3.5" />
                                            ) : (
                                                <ArrowDown className="h-3.5 w-3.5" />
                                            )
                                        ) : (
                                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                    </button>
                                </TableHead>
                                <TableHead>
                                    <button
                                        type="button"
                                        className="inline-flex items-center gap-1 text-left"
                                        onClick={() =>
                                            toggleDateSort('deadline')
                                        }
                                    >
                                        Deadline
                                        {localFilters.sort === 'deadline' ? (
                                            localFilters.direction === 'asc' ? (
                                                <ArrowUp className="h-3.5 w-3.5" />
                                            ) : (
                                                <ArrowDown className="h-3.5 w-3.5" />
                                            )
                                        ) : (
                                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                                        )}
                                    </button>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tasks.data.length === 0 ? (
                                <TableRow>
                                    <TableCell
                                        colSpan={5}
                                        className="py-8 text-center text-muted-foreground"
                                    >
                                        No tasks match these filters.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                tasks.data.map((task) => (
                                    <TableRow key={task.id}>
                                        <TableCell>
                                            <TaskToggleCheckbox
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
                                                    toggleTaskChecked(task)
                                                }
                                            />
                                        </TableCell>
                                        <TableCell className="max-w-0 pl-5 whitespace-normal">
                                            <div
                                                className={
                                                    task.task_status ===
                                                    'canceled'
                                                        ? 'line-through task-canceled-strike'
                                                        : task.checked
                                                          ? 'text-muted-foreground line-through'
                                                          : ''
                                                }
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
                                                                          'Untitled task',
                                                                  },
                                                              ]
                                                    }
                                                    language={language}
                                                    canceled={
                                                        task.task_status ===
                                                        'canceled'
                                                    }
                                                />
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {!localFilters.workspace_id &&
                                                task.note.workspace_name ? (
                                                    <span>
                                                        {
                                                            task.note
                                                                .workspace_name
                                                        }{' '}
                                                        /{' '}
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
                                        </TableCell>
                                        <TableCell>
                                            {task.due_date ? (
                                                <span className="md-task-due-token">
                                                    {`>${task.due_date}`}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {task.deadline_date ? (
                                                <span className="md-task-deadline-token">
                                                    {`>>${task.deadline_date}`}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>

                    {tasks.links.length > 3 ? (
                        <div className="flex flex-wrap items-center gap-2 border-t p-3 text-sm">
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
                                        key={link.url}
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
