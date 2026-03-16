import { Head, Link, router, usePage } from '@inertiajs/react';
import { format, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import {
    CalendarClock,
    ChevronDown,
    ChevronRight,
    FileText,
    Hash,
    History,
    Layers3,
    ListChecks,
    WholeWord,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getColorBgClass, getColorTextClass } from '@/components/color-swatch-picker';
import { getWorkspaceIconComponent } from '@/components/icon-picker';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import { cn } from '@/lib/utils';
import type { BreadcrumbItem } from '@/types';

type NoteTypeFilter = 'all' | 'note' | 'meeting' | 'journal';

type NotesFilters = {
    type: NoteTypeFilter;
    context: string;
    tags: string;
    tokens: string;
    q: string;
};

type NoteListNode = {
    id: string;
    title: string;
    href: string | null;
    icon: string | null;
    icon_color: string | null;
    icon_bg: string | null;
    type: string | null;
    context: string | null;
    tags: string[];
    path: string | null;
    has_children: boolean;
    tasks_total: number;
    tasks_open: number;
    word_count: number | null;
    revision_count: number;
    created_at: string | null;
    updated_at: string | null;
    has_note: boolean;
    is_virtual: boolean;
};

type Props = {
    roots: NoteListNode[];
    filters: NotesFilters;
};

const ROOT_KEY = '__root__';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Notes',
        href: '/notes/list',
    },
];

export default function NotesIndex({ roots, filters }: Props) {
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
        pageProps?.auth?.user?.settings?.language === 'en' ? 'en' : 'nl';
    const dateLocale = language === 'en' ? enUS : nl;

    const [localFilters, setLocalFilters] = useState<NotesFilters>(filters);
    const [appliedFilters, setAppliedFilters] = useState<NotesFilters>(filters);
    const [rootNodes, setRootNodes] = useState<NoteListNode[]>(roots);
    const [childrenByParent, setChildrenByParent] = useState<Record<string, NoteListNode[]>>({});
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
    const [expandingAll, setExpandingAll] = useState(false);

    useEffect(() => {
        setLocalFilters(filters);
        setAppliedFilters(filters);
        setRootNodes(roots);
        setChildrenByParent({});
        setExpanded(new Set());
    }, [filters, roots]);

    const toQuery = (state: NotesFilters) => {
        const query: Record<string, string> = {};
        if (state.type !== 'note') query.type = state.type;
        if (state.context.trim() !== '') query.context = state.context.trim();
        if (state.tags.trim() !== '') query.tags = state.tags.trim();
        if (state.tokens.trim() !== '') query.tokens = state.tokens.trim();
        if (state.q.trim() !== '') query.q = state.q.trim();

        return query;
    };

    const applyFilters = () => {
        const query = toQuery(localFilters);
        router.get('/notes/list', query, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const resetFilters = () => {
        const next: NotesFilters = {
            type: 'note',
            context: '',
            tags: '',
            tokens: '',
            q: '',
        };

        setLocalFilters(next);
        router.get('/notes/list', {}, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const fetchLevel = async (parentId: string | null): Promise<NoteListNode[]> => {
        const levelKey = parentId ?? ROOT_KEY;
        const query = new URLSearchParams(toQuery(appliedFilters));
        if (parentId) {
            query.set('parent_id', parentId);
        }

        setLoadingKeys((current) => new Set(current).add(levelKey));
        try {
            const response = await fetch(`/notes/tree?${query.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to load notes tree.');
            }

            const payload = (await response.json()) as { nodes?: NoteListNode[] };
            const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];

            if (parentId === null) {
                setRootNodes(nodes);
            } else {
                setChildrenByParent((current) => ({
                    ...current,
                    [parentId]: nodes,
                }));
            }

            return nodes;
        } finally {
            setLoadingKeys((current) => {
                const next = new Set(current);
                next.delete(levelKey);
                return next;
            });
        }
    };

    useEffect(() => {
        setAppliedFilters(filters);
    }, [filters]);

    const toggleNode = async (node: NoteListNode) => {
        if (!node.has_children) {
            return;
        }

        const nextExpanded = new Set(expanded);
        if (nextExpanded.has(node.id)) {
            nextExpanded.delete(node.id);
            setExpanded(nextExpanded);
            return;
        }

        nextExpanded.add(node.id);
        setExpanded(nextExpanded);

        if (!childrenByParent[node.id]) {
            await fetchLevel(node.id);
        }
    };

    const collectExpandableIds = (nodes: NoteListNode[]): Set<string> => {
        const ids = new Set<string>();
        const walk = (levelNodes: NoteListNode[]) => {
            levelNodes.forEach((node) => {
                if (!node.has_children) {
                    return;
                }

                ids.add(node.id);
                const children = childrenByParent[node.id];
                if (children && children.length > 0) {
                    walk(children);
                }
            });
        };

        walk(nodes);

        return ids;
    };

    const collapseAll = () => {
        const expandableIds = collectExpandableIds(rootNodes);
        setExpanded((current) => {
            if (expandableIds.size === 0) {
                return current;
            }

            const next = new Set(current);
            expandableIds.forEach((id) => next.delete(id));
            return next;
        });
    };

    const expandAll = async () => {
        setExpandingAll(true);
        try {
            const nextExpanded = new Set<string>();
            const queue: NoteListNode[] = [...rootNodes.filter((node) => node.has_children)];

            while (queue.length > 0) {
                const current = queue.shift();
                if (!current) {
                    continue;
                }

                nextExpanded.add(current.id);

                let children = childrenByParent[current.id];
                if (!children) {
                    children = await fetchLevel(current.id);
                }

                children
                    .filter((node) => node.has_children)
                    .forEach((child) => queue.push(child));
            }

            setExpanded(nextExpanded);
        } finally {
            setExpandingAll(false);
        }
    };

    const renderNodes = (nodes: NoteListNode[], level = 0) => {
        const formatHumanDate = (value: string | null) => {
            if (!value) {
                return '—';
            }

            try {
                return format(parseISO(value), 'PPP p', { locale: dateLocale });
            } catch {
                return value;
            }
        };

        return nodes.map((node) => {
            const isExpanded = expanded.has(node.id);
            const children = childrenByParent[node.id] ?? [];
            const isLoadingChildren = loadingKeys.has(node.id);
            const noteIconNode = node.icon
                ? getWorkspaceIconComponent(node.icon)
                : FileText;
            const iconColorClass = getColorTextClass(node.icon_color ?? null);
            const iconBgClass = getColorBgClass(node.icon_bg ?? null);

            return (
                <div key={node.id} className="space-y-1">
                    <div
                        className={cn(
                            'group flex items-start gap-2 rounded-md border-b border-border/60 px-3 py-2 transition-colors',
                            'hover:bg-muted/30',
                        )}
                        style={{ marginLeft: `${level * 18}px` }}
                    >
                        <button
                            type="button"
                            className={cn(
                                'mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-sm',
                                'text-muted-foreground hover:text-foreground',
                                !node.has_children && 'opacity-0 pointer-events-none',
                            )}
                            onClick={() => void toggleNode(node)}
                            aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
                        >
                            {node.has_children &&
                                (isExpanded ? (
                                    <ChevronDown className="h-4 w-4" />
                                ) : (
                                    <ChevronRight className="h-4 w-4" />
                                ))}
                        </button>

                        <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                            <div className="min-w-0">
                                {node.href ? (
                                    <Link
                                        href={node.href}
                                        className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-foreground hover:underline"
                                    >
                                        {node.type === 'journal' ? (
                                            node.icon ? (
                                                <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                                    <Icon iconNode={noteIconNode} className={cn('h-4 w-4', iconColorClass)} />
                                                </span>
                                            ) : (
                                                <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            )
                                        ) : (
                                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                                <Icon iconNode={noteIconNode} className={cn('h-4 w-4', iconColorClass)} />
                                            </span>
                                        )}
                                        <span className="truncate">{node.title}</span>
                                    </Link>
                                ) : (
                                    <span className="inline-flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                                        {node.type === 'journal' ? (
                                            node.icon ? (
                                                <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                                    <Icon iconNode={noteIconNode} className={cn('h-4 w-4', iconColorClass)} />
                                                </span>
                                            ) : (
                                                <Hash className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            )
                                        ) : (
                                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                                <Icon iconNode={noteIconNode} className={cn('h-4 w-4', iconColorClass)} />
                                            </span>
                                        )}
                                        <span className="truncate">{node.title}</span>
                                    </span>
                                )}
                                {(!node.is_virtual || node.has_note) && (
                                    <div className="text-muted-foreground mt-1 ml-6 flex flex-wrap items-center gap-4 text-[11px]">
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex cursor-default items-center gap-1">
                                                    <ListChecks className="h-3.5 w-3.5" />
                                                    {node.tasks_total - node.tasks_open}/{node.tasks_total}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                Tasks ((done + canceled)/total).
                                            </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex cursor-default items-center gap-1">
                                                    <WholeWord className="h-3.5 w-3.5" />
                                                    {node.word_count !== null ? node.word_count : '—'}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                {node.word_count !== null
                                                    ? 'Word count.'
                                                    : 'Word count becomes available after first save.'}
                                            </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex cursor-default items-center gap-1">
                                                    <History className="h-3.5 w-3.5" />
                                                    {node.revision_count}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                Number of revisions.
                                            </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex cursor-default items-center gap-1">
                                                    <CalendarClock className="h-3.5 w-3.5" />
                                                    {formatHumanDate(node.created_at)}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                Created at.
                                            </TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="inline-flex cursor-default items-center gap-1">
                                                    <CalendarClock className="h-3.5 w-3.5" />
                                                    {formatHumanDate(node.updated_at)}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="bottom">
                                                Last modified.
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                )}
                            </div>

                            <div className="task-inline flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                                {node.context && (
                                    <span className="mention text-[11px] font-normal">
                                        @{node.context}
                                    </span>
                                )}
                                {node.tags.map((tag) => (
                                    <span
                                        key={`${node.id}-${tag}`}
                                        className="hashtag text-[11px] font-normal"
                                    >
                                        #{tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {isExpanded && (
                        <div className="space-y-1">
                            {isLoadingChildren && children.length === 0 ? (
                                <div
                                    className="text-muted-foreground px-3 py-1 text-xs"
                                    style={{ marginLeft: `${(level + 1) * 18}px` }}
                                >
                                    Loading...
                                </div>
                            ) : (
                                renderNodes(children, level + 1)
                            )}
                        </div>
                    )}
                </div>
            );
        });
    };

    const isLoadingRoots = useMemo(() => loadingKeys.has(ROOT_KEY), [loadingKeys]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Notes" />

            <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-4 sm:px-6 flex-1 overflow-y-auto">
                <div className="rounded-xl bg-card p-4">
                    <form
                        className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_260px_auto_auto]"
                        onSubmit={(event) => {
                            event.preventDefault();
                            applyFilters();
                        }}
                    >
                        <Input
                            value={localFilters.q}
                            onChange={(event) =>
                                setLocalFilters((current) => ({
                                    ...current,
                                    q: event.target.value,
                                }))
                            }
                            placeholder="Search title or slug..."
                        />
                        <Select
                            value={localFilters.type}
                            onValueChange={(value: NoteTypeFilter) =>
                                setLocalFilters((current) => ({
                                    ...current,
                                    type: value,
                                }))
                            }
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="note">Normal notes</SelectItem>
                                <SelectItem value="meeting">Meeting notes</SelectItem>
                                <SelectItem value="journal">Journal notes</SelectItem>
                                <SelectItem value="all">All notes</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            value={localFilters.tokens}
                            onChange={(event) =>
                                setLocalFilters((current) => ({
                                    ...current,
                                    tokens: event.target.value,
                                }))
                            }
                            placeholder="Context/Tags (@name, #tag) any match"
                        />
                        <Button type="submit">Apply</Button>
                        <Button type="button" variant="ghost" onClick={resetFilters}>
                            Reset
                        </Button>
                    </form>
                </div>

                <div className="rounded-xl bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Workspace notes</div>
                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => void expandAll()}
                                disabled={expandingAll || isLoadingRoots}
                            >
                                <Layers3 className="mr-1.5 h-4 w-4" />
                                Expand all
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={collapseAll}
                                disabled={expanded.size === 0}
                            >
                                Collapse all
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-1">
                        {isLoadingRoots && rootNodes.length === 0 && (
                            <div className="text-muted-foreground px-2 py-3 text-sm">
                                Loading notes...
                            </div>
                        )}
                        {!isLoadingRoots && rootNodes.length === 0 && (
                            <div className="text-muted-foreground px-2 py-3 text-sm">
                                No notes found for the current filters.
                            </div>
                        )}
                        {renderNodes(rootNodes)}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
