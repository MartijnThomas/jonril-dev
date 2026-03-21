import { Head, Link, usePage } from '@inertiajs/react';
import { enUS, nl } from 'date-fns/locale';
import { Kanban, List, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { TaskInlineContent } from '@/components/task-inline-content';
import type { TaskRenderFragment } from '@/components/task-inline-content';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTaskFilters } from '@/hooks/use-task-filters';
import type { FilterPreset, Filters } from '@/hooks/use-task-filters';
import AppLayout from '@/layouts/app-layout';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type TaskItem = {
    id: number;
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
};

type Props = {
    tasks: {
        total: number;
    };
    kanbanColumns: KanbanColumn[];
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

export default function TasksKanban({
    tasks,
    kanbanColumns,
    filters,
    filterPresets,
}: Props) {
    const { t } = useI18n();
    const page = usePage();
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
    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('tasks_index.heading', 'Tasks'),
            href: '/tasks/kanban',
        },
    ];

    const {
        localFilters,
        applyFilters,
    } = useTaskFilters({
        initialFilters: filters,
        filterPresets,
        t,
        dateLocale,
        basePath: '/tasks/kanban',
    });

    const [searchInput, setSearchInput] = useState(filters.q ?? '');
    const minSearchChars = 3;

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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('tasks_index.page_title', 'Tasks')} />

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 pt-2 md:p-6">
                    <section className="rounded-xl border bg-card p-4 md:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="flex items-baseline gap-2">
                                    <h1 className="text-2xl font-semibold leading-none md:text-3xl">
                                        {t('tasks_index.heading', 'Tasks')}
                                    </h1>
                                    <span className="text-xs text-muted-foreground md:text-sm">
                                        {resultsCountLabel}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button variant="secondary" asChild>
                                    <Link href={`/tasks${querySuffix}`}>
                                        <List className="h-4 w-4" />
                                        {t('tasks_index.list_view', 'List')}
                                    </Link>
                                </Button>
                                <Button variant="default" asChild>
                                    <Link href={`/tasks/kanban${querySuffix}`}>
                                        <Kanban className="h-4 w-4" />
                                        {t('tasks_index.kanban_view', 'Kanban')}
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        <form
                            className="mt-4 flex items-center gap-2"
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
                                        'Search tasks, mentions, hashtags, due dates…',
                                    )}
                                    className="h-10 pl-9"
                                />
                            </div>
                        </form>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-4">
                        {kanbanColumns.map((column) => (
                            <div
                                key={column.key}
                                className="flex min-h-[18rem] flex-col rounded-xl border bg-card"
                            >
                                <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-3 py-2">
                                    <h2 className="text-sm font-semibold">{column.label}</h2>
                                    <Badge variant="secondary">{column.tasks.length}</Badge>
                                </div>

                                <div className="flex flex-1 flex-col gap-2 p-2">
                                    {column.tasks.length === 0 ? (
                                        <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                                            {t('tasks_index.no_tasks_found', 'No tasks found.')}
                                        </div>
                                    ) : (
                                        column.tasks.map((task) => (
                                            <Link
                                                key={task.id}
                                                href={task.note.href}
                                                className={cn(
                                                    'block rounded-md border bg-background px-3 py-2 transition-colors hover:bg-muted/40',
                                                    task.checked && 'opacity-70',
                                                )}
                                            >
                                                <div className="line-clamp-3 text-sm">
                                                    <TaskInlineContent
                                                        fragments={
                                                            task.render_fragments.length > 0
                                                                ? task.render_fragments
                                                                : [{ type: 'text', text: task.content }]
                                                        }
                                                        className="leading-relaxed"
                                                        hidePriorityTokens
                                                        hideStatusTokens
                                                    />
                                                </div>
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                    <span className="truncate">
                                                        {task.note.parent_title
                                                            ? `${task.note.parent_title} / `
                                                            : ''}
                                                        {task.note.title}
                                                    </span>
                                                </div>
                                            </Link>
                                        ))
                                    )}
                                </div>
                            </div>
                        ))}
                    </section>
                </div>
            </div>
        </AppLayout>
    );
}
