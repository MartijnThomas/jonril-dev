import { Head, Link, router } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type TaskItem = {
    id: number;
    checked: boolean;
    content: string;
    due_date: string | null;
    deadline_date: string | null;
    mentions: string[];
    hashtags: string[];
    note: {
        id: string;
        title: string;
        href: string;
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
    note_id: string;
    parent_id: string;
    mention: string;
    hashtag: string;
    due_from: string;
    due_to: string;
    deadline_from: string;
    deadline_to: string;
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
    notes: { id: string; title: string }[];
};

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Tasks',
        href: '/tasks',
    },
];

export default function TasksIndex({ tasks, filters, notes }: Props) {
    const [localFilters, setLocalFilters] = useState<Filters>(filters);

    const parentOptions = useMemo(() => {
        return notes.filter((note) => note.id !== localFilters.note_id);
    }, [localFilters.note_id, notes]);

    const applyFilters = (next: Partial<Filters>) => {
        const merged = { ...localFilters, ...next };
        setLocalFilters(merged);

        router.get('/tasks', merged, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        const reset: Filters = {
            q: '',
            note_id: '',
            parent_id: '',
            mention: '',
            hashtag: '',
            due_from: '',
            due_to: '',
            deadline_from: '',
            deadline_to: '',
            show_completed: false,
            sort: 'due',
            direction: 'asc',
        };

        setLocalFilters(reset);
        router.get('/tasks', reset, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const labelText = (label: string) =>
        label
            .replace(/&laquo;/g, '«')
            .replace(/&raquo;/g, '»')
            .replace(/<[^>]+>/g, '')
            .trim();

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Tasks" />

            <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
                <section className="grid grid-cols-1 gap-3 rounded-xl border bg-card p-4 md:grid-cols-6">
                    <Input
                        value={localFilters.q}
                        onChange={(event) =>
                            setLocalFilters((prev) => ({
                                ...prev,
                                q: event.target.value,
                            }))
                        }
                        onBlur={() => applyFilters({ q: localFilters.q })}
                        placeholder="Search task text or note"
                        className="md:col-span-2"
                    />

                    <Select
                        value={localFilters.note_id || '__all__'}
                        onValueChange={(value) =>
                            applyFilters({ note_id: value === '__all__' ? '' : value })
                        }
                    >
                        <SelectTrigger className="w-full md:col-span-1">
                            <SelectValue placeholder="All notes" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All notes</SelectItem>
                            {notes.map((note) => (
                                <SelectItem key={note.id} value={note.id}>
                                    {note.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select
                        value={localFilters.parent_id || '__all__'}
                        onValueChange={(value) =>
                            applyFilters({ parent_id: value === '__all__' ? '' : value })
                        }
                    >
                        <SelectTrigger className="w-full md:col-span-1">
                            <SelectValue placeholder="All parents" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All parents</SelectItem>
                            {parentOptions.map((note) => (
                                <SelectItem key={note.id} value={note.id}>
                                    {note.title}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select
                        value={localFilters.sort}
                        onValueChange={(value) =>
                            applyFilters({ sort: value as Filters['sort'] })
                        }
                    >
                        <SelectTrigger className="w-full md:col-span-1">
                            <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="due">Sort: due date</SelectItem>
                            <SelectItem value="deadline">Sort: deadline</SelectItem>
                            <SelectItem value="updated">Sort: updated</SelectItem>
                            <SelectItem value="note">Sort: note</SelectItem>
                            <SelectItem value="position">Sort: position</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select
                        value={localFilters.direction}
                        onValueChange={(value) =>
                            applyFilters({ direction: value as Filters['direction'] })
                        }
                    >
                        <SelectTrigger className="w-full md:col-span-1">
                            <SelectValue placeholder="Direction" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="asc">Asc</SelectItem>
                            <SelectItem value="desc">Desc</SelectItem>
                        </SelectContent>
                    </Select>

                    <Input
                        value={localFilters.mention}
                        onChange={(event) =>
                            setLocalFilters((prev) => ({
                                ...prev,
                                mention: event.target.value,
                            }))
                        }
                        onBlur={() => applyFilters({ mention: localFilters.mention })}
                        placeholder="Mention (without @)"
                        className="md:col-span-1"
                    />

                    <Input
                        value={localFilters.hashtag}
                        onChange={(event) =>
                            setLocalFilters((prev) => ({
                                ...prev,
                                hashtag: event.target.value,
                            }))
                        }
                        onBlur={() => applyFilters({ hashtag: localFilters.hashtag })}
                        placeholder="Hashtag (without #)"
                        className="md:col-span-1"
                    />

                    <Input
                        type="date"
                        value={localFilters.due_from}
                        onChange={(event) => applyFilters({ due_from: event.target.value })}
                        className="md:col-span-1"
                    />

                    <Input
                        type="date"
                        value={localFilters.due_to}
                        onChange={(event) => applyFilters({ due_to: event.target.value })}
                        className="md:col-span-1"
                    />

                    <Input
                        type="date"
                        value={localFilters.deadline_from}
                        onChange={(event) =>
                            applyFilters({ deadline_from: event.target.value })
                        }
                        className="md:col-span-1"
                    />

                    <Input
                        type="date"
                        value={localFilters.deadline_to}
                        onChange={(event) => applyFilters({ deadline_to: event.target.value })}
                        className="md:col-span-1"
                    />

                    <label className="text-muted-foreground flex items-center justify-between gap-2 rounded-md border px-3 text-sm md:col-span-1">
                        Show completed
                        <Switch
                            checked={localFilters.show_completed}
                            onCheckedChange={(checked) =>
                                applyFilters({ show_completed: checked })
                            }
                        />
                    </label>

                    <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground rounded-md border px-3 text-sm transition-colors md:col-span-1"
                        onClick={resetFilters}
                    >
                        Reset
                    </button>
                </section>

                <section className="rounded-xl border bg-card">
                    <div className="border-b px-4 py-3 text-sm text-muted-foreground">
                        {tasks.total} tasks
                    </div>

                    <div className="divide-y">
                        {tasks.data.length === 0 ? (
                            <div className="p-4 text-sm text-muted-foreground">
                                No tasks match these filters.
                            </div>
                        ) : (
                            tasks.data.map((task) => (
                                <article key={task.id} className="space-y-2 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div
                                                className={`leading-6 ${task.checked ? 'text-muted-foreground line-through' : ''}`}
                                            >
                                                {task.content || 'Untitled task'}
                                            </div>
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                {task.note.parent_title
                                                    ? `${task.note.parent_title} / `
                                                    : ''}
                                                <Link
                                                    href={task.note.href}
                                                    className="hover:text-foreground underline-offset-2 hover:underline"
                                                >
                                                    {task.note.title}
                                                </Link>
                                            </div>
                                        </div>

                                        <div className="text-right text-xs text-muted-foreground">
                                            {task.due_date && <div>Due: {task.due_date}</div>}
                                            {task.deadline_date && (
                                                <div>Deadline: {task.deadline_date}</div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 text-xs">
                                        {task.mentions.map((mention) => (
                                            <span
                                                key={`${task.id}-mention-${mention}`}
                                                className="rounded bg-purple-500/10 px-2 py-0.5 text-purple-700"
                                            >
                                                @{mention}
                                            </span>
                                        ))}
                                        {task.hashtags.map((hashtag) => (
                                            <span
                                                key={`${task.id}-hashtag-${hashtag}`}
                                                className="rounded bg-blue-500/10 px-2 py-0.5 text-blue-700"
                                            >
                                                #{hashtag}
                                            </span>
                                        ))}
                                    </div>
                                </article>
                            ))
                        )}
                    </div>

                    {tasks.links.length > 3 && (
                        <div className="flex flex-wrap items-center gap-2 border-t p-3 text-sm">
                            {tasks.links.map((link, index) => {
                                if (!link.url) {
                                    return (
                                        <span
                                            key={`ellipsis-${index}`}
                                            className="text-muted-foreground px-2 py-1"
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
                    )}
                </section>
            </div>
        </AppLayout>
    );
}
