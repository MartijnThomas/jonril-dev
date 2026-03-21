import { Link } from '@inertiajs/react';
import {
    Bookmark,
    Kanban,
    List,
    Search,
    SlidersHorizontal,
    Table,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type TasksHeaderProps = {
    title: string;
    resultsCountLabel: string;
    currentView: 'list' | 'kanban';
    querySuffix: string;
    searchValue: string;
    onSearchChange: (value: string) => void;
    filterOpen: boolean;
    onFilterOpenChange: (open: boolean) => void;
    activeFilterCount: number;
    className?: string;
    titleMeta?: ReactNode;
    rightActions?: ReactNode;
    presetsButton?: ReactNode;
    filterPanel?: ReactNode;
};

export function TasksHeader({
    title,
    resultsCountLabel,
    currentView,
    querySuffix,
    searchValue,
    onSearchChange,
    filterOpen,
    onFilterOpenChange,
    activeFilterCount,
    className,
    titleMeta = null,
    rightActions = null,
    presetsButton = null,
    filterPanel = null,
}: TasksHeaderProps): JSX.Element {
    const { t } = useI18n();

    return (
        <section className={cn('rounded-2xl bg-transparent px-1 py-2 md:px-2', className)}>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                        {title}
                    </h1>
                    <p className="mt-1 text-sm text-muted-foreground">{resultsCountLabel}</p>
                    {titleMeta}
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
                <div className="inline-flex rounded-xl bg-muted p-1">
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-lg"
                        variant={currentView === 'kanban' ? 'default' : 'ghost'}
                        asChild
                    >
                        <Link href={`/tasks/kanban${querySuffix}`}>
                            <Kanban className="h-4 w-4" />
                            {t('tasks_index.kanban_view', 'Board')}
                        </Link>
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-lg"
                        variant={currentView === 'list' ? 'default' : 'ghost'}
                        asChild
                    >
                        <Link href={`/tasks${querySuffix}`}>
                            <List className="h-4 w-4" />
                            {t('tasks_index.list_view', 'List')}
                        </Link>
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-8 rounded-lg" disabled>
                        <Table className="h-4 w-4" />
                        {t('tasks_kanban.table_view', 'Table')}
                    </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full min-w-60 flex-1 sm:w-[260px] sm:flex-none">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchValue}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder={t(
                                'tasks_index.search_placeholder',
                                'Search tasks, notes, parents...',
                            )}
                            className="h-10 rounded-xl border-border/70 bg-background pl-9"
                        />
                    </div>
                    {presetsButton ?? (
                        <Button type="button" variant="outline" className="h-10 rounded-xl" asChild>
                            <Link href="/settings/task-filters">
                                <Bookmark className="h-4 w-4" />
                                {t('tasks_index.filter_presets_label', 'Preset filters')}
                            </Link>
                        </Button>
                    )}
                    <Popover open={filterOpen} onOpenChange={onFilterOpenChange}>
                        <PopoverTrigger asChild>
                            <Button
                                type="button"
                                variant="outline"
                                className="h-10 rounded-xl"
                            >
                                <SlidersHorizontal className="h-4 w-4" />
                                {t('tasks_kanban.filters', 'Filters')}
                                {activeFilterCount > 0 ? (
                                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">
                                        {activeFilterCount}
                                    </span>
                                ) : null}
                            </Button>
                        </PopoverTrigger>
                        {filterPanel ? (
                            <PopoverContent
                                align="end"
                                side="bottom"
                                sideOffset={8}
                                className="w-[min(96vw,420px)] rounded-xl border border-border/60 bg-background p-3 shadow-xl"
                            >
                                {filterPanel}
                            </PopoverContent>
                        ) : null}
                    </Popover>
                    {rightActions}
                </div>
            </div>
        </section>
    );
}
