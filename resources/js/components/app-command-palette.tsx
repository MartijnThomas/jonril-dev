import { router, usePage } from '@inertiajs/react';
import {
    CalendarDays,
    ChevronDown,
    ChevronUp,
    Command as CommandIcon,
    FileText,
    Heading,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getColorTextClass } from '@/components/color-swatch-picker';
import { getLucideIconComponent } from '@/components/icon-picker';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from '@/components/ui/command';
import { useI18n } from '@/lib/i18n';
import { TASK_STATUS_ICONS } from '@/lib/task-status-icons';
import type { TaskStatus } from '@/lib/task-status-icons';
import { cn } from '@/lib/utils';
import { clear, destroy, rename } from '@/routes/notes';

type NoteSearchItem = {
    id: string;
    title: string;
    href: string;
    slug: string | null;
    path: string | null;
    type: string | null;
    journal_granularity?: string | null;
    icon?: string | null;
    icon_color?: string | null;
    match_source?: 'title' | 'path' | 'heading' | 'content' | null;
    match_text?: string | null;
    match_block_id?: string | null;
    match_heading?: string | null;
};

type TaskSearchItem = {
    id: string;
    note_id: string;
    title: string;
    task_title?: string | null;
    note_title?: string | null;
    note_href?: string | null;
    href: string;
    path: string | null;
    type: string | null;
    journal_granularity?: string | null;
    icon?: string | null;
    icon_color?: string | null;
    icon_bg?: string | null;
    task_status?: string | null;
    checked?: boolean;
    section_heading?: string | null;
};

type SearchResultItem = NoteSearchItem & {
    matchedTasks: TaskSearchItem[];
};

type NoteActionsContext = {
    id: string;
    title: string;
    path?: string | null;
    type?: string | null;
    journal_granularity?: string | null;
    icon?: string | null;
    icon_color?: string | null;
    canMove?: boolean;
    canRename: boolean;
    canDelete: boolean;
    canClear: boolean;
};

type RecentNoteItem = NoteSearchItem & {
    lastOpenedAt: number;
};

type CommandDefinition = {
    id: 'create' | 'move' | 'rename' | 'clear' | 'delete';
    aliases?: string[];
    label: string;
    syntax: string;
    description: string;
    available: boolean;
};

type TaskStatusFilter =
    | 'open'
    | 'in_progress'
    | 'assigned'
    | 'starred'
    | 'deferred'
    | 'migrated'
    | 'closed'
    | 'canceled';

const DEFAULT_TASK_STATUSES: TaskStatusFilter[] = [
    'open',
    'in_progress',
    'assigned',
    'starred',
    'deferred',
];

const TASK_STATUS_LABELS: Record<TaskStatusFilter, string> = {
    open: 'Open',
    in_progress: 'In progress',
    assigned: 'Assigned',
    starred: 'Starred',
    deferred: 'Deferred',
    migrated: 'Migrated',
    closed: 'Closed',
    canceled: 'Canceled',
};

const ALL_TASK_STATUSES: TaskStatusFilter[] = [
    'open',
    'in_progress',
    'assigned',
    'starred',
    'deferred',
    'migrated',
    'closed',
    'canceled',
];

export function AppCommandPalette() {
    const page = usePage().props as {
        noteActions?: NoteActionsContext;
        currentWorkspace?: {
            id: string;
            slug?: string | null;
            is_migrated_source?: boolean;
        } | null;
    };
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [noteTypeFilters, setNoteTypeFilters] = useState({
        regular: true,
        journal: true,
        meeting: true,
    });
    const [searchTargets, setSearchTargets] = useState({
        notes: true,
        headings: true,
        tasks: true,
    });
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const [taskStatuses, setTaskStatuses] = useState<TaskStatusFilter[]>(DEFAULT_TASK_STATUSES);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [noteItems, setNoteItems] = useState<NoteSearchItem[]>([]);
    const [taskItems, setTaskItems] = useState<TaskSearchItem[]>([]);
    const [recentItems, setRecentItems] = useState<RecentNoteItem[]>([]);
    const quickSwitchActiveRef = useRef(false);
    const quickSwitchPressCountRef = useRef(0);
    const quickSwitchIndexRef = useRef(-1);
    const [selectedCommandValue, setSelectedCommandValue] = useState('');
    const noteActions = page.noteActions ?? null;
    const workspaceId = page.currentWorkspace?.id ?? 'global';
    const workspaceSlug = page.currentWorkspace?.slug ?? null;
    const commandPaletteDisabled = page.currentWorkspace?.is_migrated_source === true;

    const openInCommandMode = useCallback(() => {
        setSelectedCommandValue('');
        setQuery(':');
        setOpen(true);
        quickSwitchActiveRef.current = false;
        quickSwitchPressCountRef.current = 0;
        quickSwitchIndexRef.current = -1;

        requestAnimationFrame(() => {
            const input = document.querySelector(
                '[data-slot="command-input"]',
            ) as HTMLInputElement | null;

            if (!input) {
                return;
            }

            input.focus();
            const caretPosition = input.value.length;
            input.setSelectionRange(caretPosition, caretPosition);
        });
    }, []);

    useEffect(() => {
        const resetQuickSwitch = () => {
            quickSwitchActiveRef.current = false;
            quickSwitchPressCountRef.current = 0;
            quickSwitchIndexRef.current = -1;
        };

        const cycleRecentSelection = () => {
            const source = recentItems.length > 0 ? recentItems : readRecentItems();
            if (source.length === 0) {
                return;
            }

            const nextIndex =
                quickSwitchIndexRef.current < 0
                    ? 0
                    : (quickSwitchIndexRef.current + 1) % source.length;

            quickSwitchIndexRef.current = nextIndex;
            setSelectedCommandValue(`recent:${source[nextIndex].id}`);
        };

        const openSelectedRecent = () => {
            const source = recentItems.length > 0 ? recentItems : readRecentItems();
            const selectedIndex = quickSwitchIndexRef.current;

            if (source.length === 0 || selectedIndex < 0 || selectedIndex >= source.length) {
                return;
            }

            const item = source[selectedIndex];
            upsertRecentItem(item);
            setOpen(false);
            router.get(
                item.href,
                {},
                {
                    preserveState: false,
                    preserveScroll: false,
                },
            );
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
                return;
            }

            if (commandPaletteDisabled) {
                return;
            }

            event.preventDefault();

            if (event.shiftKey) {
                openInCommandMode();
                return;
            }

            if (!open) {
                setQuery('');
                setOpen(true);
                quickSwitchActiveRef.current = true;
                quickSwitchPressCountRef.current = 1;
                cycleRecentSelection();
                return;
            }

            if (query.trim() === '') {
                quickSwitchActiveRef.current = true;
                quickSwitchPressCountRef.current += 1;
                cycleRecentSelection();
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.key !== 'Meta' && event.key !== 'Control') {
                return;
            }

            const shouldOpenSelected =
                quickSwitchActiveRef.current &&
                open &&
                query.trim() === '' &&
                quickSwitchPressCountRef.current >= 2;

            if (shouldOpenSelected) {
                openSelectedRecent();
            }

            resetQuickSwitch();
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    // This keyboard session intentionally tracks state across rapid key events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [commandPaletteDisabled, open, query, recentItems, openInCommandMode]);

    useEffect(() => {
        if (open) {
            return;
        }

        quickSwitchActiveRef.current = false;
        quickSwitchPressCountRef.current = 0;
        quickSwitchIndexRef.current = -1;
        setSelectedCommandValue('');
    }, [open]);

    useEffect(() => {
        const openHandler = () => {
            if (commandPaletteDisabled) {
                return;
            }
            setOpen(true);
        };
        const openCommandModeHandler = () => {
            if (commandPaletteDisabled) {
                return;
            }
            openInCommandMode();
        };

        window.addEventListener('open-command-palette', openHandler);
        window.addEventListener(
            'open-command-palette-command-mode',
            openCommandModeHandler,
        );

        return () => {
            window.removeEventListener('open-command-palette', openHandler);
            window.removeEventListener(
                'open-command-palette-command-mode',
                openCommandModeHandler,
            );
        };
    }, [commandPaletteDisabled, openInCommandMode]);

    useEffect(() => {
        if (!commandPaletteDisabled) {
            return;
        }

        setOpen(false);
    }, [commandPaletteDisabled]);

    const isCommandMode = query.trimStart().startsWith(':');
    const commandText = useMemo(
        () => {
            if (!isCommandMode) {
                return '';
            }

            return query.trimStart().slice(1).trim();
        },
        [isCommandMode, query],
    );
    const effectiveQuery = useMemo(
        () => query.trim(),
        [query],
    );
    const shouldSearchNotes = !isCommandMode && searchTargets.notes;
    const shouldSearchHeadings = !isCommandMode && searchTargets.headings;
    const shouldSearchTasks = !isCommandMode && searchTargets.tasks;
    const shouldRunScopedSearch = !isCommandMode && (searchTargets.notes || searchTargets.headings || searchTargets.tasks);
    const shouldShowRecent = !isCommandMode && effectiveQuery === '';
    const recentStorageKey = useMemo(
        () => `command-palette:recent-notes:${workspaceId}`,
        [workspaceId],
    );

    const readRecentItems = useCallback(() => {
        if (typeof window === 'undefined') {
            return [] as RecentNoteItem[];
        }

        try {
            const raw = window.localStorage.getItem(recentStorageKey);
            if (!raw) {
                return [] as RecentNoteItem[];
            }

            const parsed = JSON.parse(raw) as RecentNoteItem[];
            if (!Array.isArray(parsed)) {
                return [] as RecentNoteItem[];
            }

            return parsed
                .filter((item) => item && typeof item.id === 'string')
                .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
        } catch {
            return [] as RecentNoteItem[];
        }
    }, [recentStorageKey]);

    const upsertRecentItem = useCallback((item: NoteSearchItem) => {
        if (typeof window === 'undefined') {
            return;
        }

        try {
            const existing = readRecentItems();
            const next: RecentNoteItem[] = [
                {
                    ...item,
                    lastOpenedAt: Date.now(),
                },
                ...existing.filter((current) => current.id !== item.id),
            ].slice(0, 20);

            window.localStorage.setItem(recentStorageKey, JSON.stringify(next));
            setRecentItems(next);
        } catch {
            // ignore storage errors
        }
    }, [readRecentItems, recentStorageKey]);

    useEffect(() => {
        if (!open) {
            return;
        }

        setRecentItems(readRecentItems());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, recentStorageKey]);

    useEffect(() => {
        if (!noteActions) {
            return;
        }

        const href =
            typeof window !== 'undefined'
                ? window.location.pathname
                : (() => {
                      const workspaceSlug =
                          page.currentWorkspace?.slug?.trim() ?? '';

                      return workspaceSlug !== ''
                          ? `/w/${workspaceSlug}/notes/${noteActions.id}`
                          : `/notes/${noteActions.id}`;
                  })();

        upsertRecentItem({
            id: noteActions.id,
            title: noteActions.title,
            href,
            slug: null,
            path: null,
            type:
                noteActions.type ??
                (href.includes('/journal/') ? 'journal' : 'note'),
            journal_granularity: noteActions.journal_granularity ?? null,
            icon: noteActions.icon ?? null,
            icon_color: noteActions.icon_color ?? null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteActions?.id, noteActions?.title, recentStorageKey]);

    const commandDefinitions = useMemo<CommandDefinition[]>(
        () => [
            {
                id: 'create',
                aliases: ['new', 'n'],
                label: t('command_palette.create_note', 'Create note'),
                syntax: t('command_palette.create_syntax', ':create'),
                description: t(
                    'command_palette.create_description',
                    'Open the create note dialog.',
                ),
                available: !commandPaletteDisabled,
            },
            {
                id: 'move',
                aliases: ['mv'],
                label: t('command_palette.move_note', 'Move note'),
                syntax: t('command_palette.move_syntax', ':move'),
                description: t(
                    'command_palette.move_description',
                    'Move the current note to a different parent.',
                ),
                available: Boolean(noteActions?.canMove),
            },
            {
                id: 'rename',
                aliases: ['r'],
                label: t('command_palette.rename_note', 'Rename note'),
                syntax: t(
                    'command_palette.rename_syntax',
                    ':rename <new title>',
                ),
                description: t(
                    'command_palette.rename_description',
                    'Rename the current note and rebuild its slug.',
                ),
                available: Boolean(noteActions?.canRename),
            },
            {
                id: 'clear',
                aliases: ['erase', 'c'],
                label: t('command_palette.erase_note', 'Erase note'),
                syntax: t('command_palette.erase_syntax', ':erase'),
                description: t(
                    'command_palette.erase_description',
                    'Erase note content and remove note properties.',
                ),
                available: Boolean(noteActions?.canClear),
            },
            {
                id: 'delete',
                aliases: ['remove', 'd'],
                label: t('command_palette.delete_note', 'Delete note'),
                syntax: t('command_palette.delete_syntax', ':delete'),
                description: t(
                    'command_palette.delete_description',
                    'Soft delete the current note.',
                ),
                available: Boolean(noteActions?.canDelete),
            },
        ],
        [
            noteActions?.canClear,
            noteActions?.canDelete,
            noteActions?.canMove,
            noteActions?.canRename,
            commandPaletteDisabled,
            t,
        ],
    );

    const renderNoteIcon = (item: Pick<NoteSearchItem, 'type' | 'icon' | 'icon_color'>) => {
        const fallback = item.type === 'journal'
            ? CalendarDays
            : item.type === 'meeting'
                ? Users
                : FileText;
        const IconComponent = getLucideIconComponent(item.icon ?? null, fallback);
        const colorClass = getColorTextClass(item.icon_color ?? 'default');

        return <IconComponent className={cn('h-4 w-4', colorClass)} />;
    };

    const parsedCommand = useMemo(() => {
        if (!isCommandMode || commandText === '') {
            return { name: '', args: '' };
        }

        const [name, ...rest] = commandText.split(/\s+/);
        return {
            name: name.toLowerCase(),
            args: rest.join(' ').trim(),
        };
    }, [commandText, isCommandMode]);

    const commandItems = useMemo(() => {
        if (!isCommandMode) {
            return [];
        }

        const visible = commandDefinitions.filter((definition) => definition.available);
        if (visible.length === 0) {
            return [];
        }

        if (parsedCommand.name === '') {
            return visible;
        }

        return visible.filter((definition) =>
            definition.id.startsWith(parsedCommand.name) ||
            (definition.aliases ?? []).some((alias) =>
                alias.startsWith(parsedCommand.name),
            ),
        );
    }, [commandDefinitions, isCommandMode, parsedCommand.name]);

    const runCommand = (commandId: CommandDefinition['id']) => {
        const noteId = noteActions?.id;

        const normalizedCommand: CommandDefinition['id'] =
            commandId === 'create' ||
            commandId === 'move' ||
            commandId === 'clear' ||
            commandId === 'delete' ||
            commandId === 'rename'
                ? commandId
                : parsedCommand.name === 'erase'
                  ? 'clear'
                  : parsedCommand.name === 'new'
                    ? 'create'
                  : parsedCommand.name === 'n'
                    ? 'create'
                  : parsedCommand.name === 'mv'
                    ? 'move'
                  : parsedCommand.name === 'remove'
                    ? 'delete'
                    : parsedCommand.name === 'r'
                      ? 'rename'
                      : parsedCommand.name === 'c'
                        ? 'clear'
                        : parsedCommand.name === 'd'
                          ? 'delete'
                          : commandId;

        if (normalizedCommand === 'create') {
            setOpen(false);
            window.dispatchEvent(new Event('open-create-note-dialog'));
            return;
        }

        if (normalizedCommand === 'move') {
            setOpen(false);
            window.dispatchEvent(new Event('open-move-note-dialog'));
            return;
        }

        if (!noteId) {
            return;
        }

        if (normalizedCommand === 'rename') {
            const title = parsedCommand.args;
            if (title === '') {
                return;
            }

            setOpen(false);
            router.patch(
                rename.url(noteId),
                { title },
                {
                    preserveState: false,
                    preserveScroll: true,
                },
            );
            return;
        }

        if (normalizedCommand === 'clear') {
            const confirmed = window.confirm(
                t(
                    'command_palette.erase_confirm',
                    'Erase this note? This removes all content and properties.',
                ),
            );
            if (!confirmed) {
                return;
            }

            setOpen(false);
            router.patch(
                clear.url(noteId),
                {},
                {
                    preserveState: false,
                    preserveScroll: true,
                },
            );
            return;
        }

        const confirmed = window.confirm(
            t(
                'command_palette.delete_confirm',
                'Delete this note? It will be soft deleted.',
            ),
        );
        if (!confirmed) {
            return;
        }

        setOpen(false);
        router.delete(destroy.url(noteId), {
            preserveState: false,
            preserveScroll: false,
        });
    };

    const prefillCommandInput = (commandId: CommandDefinition['id']) => {
        const prefix = `:${commandId} `;
        setQuery(prefix);
        setSelectedCommandValue('');

        requestAnimationFrame(() => {
            const input = document.querySelector(
                '[data-slot="command-input"]',
            ) as HTMLInputElement | null;

            if (!input) {
                return;
            }

            input.focus();
            const caretPosition = input.value.length;
            input.setSelectionRange(caretPosition, caretPosition);
        });
    };

    const commandPreview = (command: CommandDefinition) => {
        const currentTitle =
            noteActions?.title?.trim()
                ? noteActions.title
                : t('command_palette.untitled', 'Untitled');

        if (command.id === 'rename') {
            const nextTitle =
                parsedCommand.args.trim() !== ''
                    ? parsedCommand.args.trim()
                    : t('command_palette.rename_target_placeholder', '...');

            return t(
                'command_palette.rename_preview',
                `Rename ${currentTitle} -> ${nextTitle}`,
            )
                .replace(':from', currentTitle)
                .replace(':to', nextTitle);
        }

        if (command.id === 'move') {
            const currentPath =
                noteActions?.path?.trim() ||
                noteActions?.title?.trim() ||
                t('command_palette.untitled', 'Untitled');

            return t(
                'command_palette.move_preview',
                'Move :path',
            ).replace(':path', currentPath);
        }

        if (command.id === 'create') {
            return t(
                'command_palette.create_preview',
                'Open create note dialog',
            );
        }

        if (command.id === 'clear') {
            return t(
                'command_palette.erase_preview',
                `Erase ${currentTitle}`,
            ).replace(':title', currentTitle);
        }

        return t(
            'command_palette.delete_preview',
            `Delete ${currentTitle}`,
        ).replace(':title', currentTitle);
    };

    const highlightedFragments = (value: string, needle: string) => {
        const trimmedNeedle = needle.trim();
        if (trimmedNeedle === '') {
            return [{ text: value, highlighted: false }];
        }

        const escapedNeedle = trimmedNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedNeedle})`, 'ig');
        const parts = value.split(regex);

        return parts
            .filter((part) => part !== '')
            .map((part) => ({
                text: part,
                highlighted: part.toLowerCase() === trimmedNeedle.toLowerCase(),
            }));
    };

    const renderHighlightedText = (text: string, className?: string) => (
        <span className={className}>
            {highlightedFragments(text, effectiveQuery).map((fragment, j) => (
                <span
                    key={j}
                    className={fragment.highlighted ? 'bg-yellow-200/70 text-foreground rounded px-0.5' : undefined}
                >
                    {fragment.text}
                </span>
            ))}
        </span>
    );

    const resolveTaskStatusForDisplay = (task: TaskSearchItem): TaskStatus => {
        if (task.checked === true) {
            return 'completed';
        }

        const normalized = (task.task_status ?? '').toLowerCase();
        if (
            normalized === 'assigned' ||
            normalized === 'in_progress' ||
            normalized === 'backlog' ||
            normalized === 'deferred' ||
            normalized === 'starred' ||
            normalized === 'migrated' ||
            normalized === 'canceled' ||
            normalized === 'completed'
        ) {
            return normalized;
        }

        if (normalized === 'question') {
            return 'deferred';
        }

        return 'open';
    };

    const resultItems = useMemo<SearchResultItem[]>(() => {
        const tasksByNoteId = new Map<string, TaskSearchItem[]>();
        for (const task of taskItems) {
            const existing = tasksByNoteId.get(task.note_id);
            if (existing) {
                existing.push(task);
            } else {
                tasksByNoteId.set(task.note_id, [task]);
            }
        }

        const seenNoteIds = new Set<string>();
        const merged: SearchResultItem[] = noteItems.map((item) => {
            seenNoteIds.add(item.id);

            return {
                ...item,
                matchedTasks: shouldSearchTasks ? (tasksByNoteId.get(item.id) ?? []) : [],
            };
        });

        if (!shouldSearchTasks) {
            return merged;
        }

        for (const task of taskItems) {
            if (seenNoteIds.has(task.note_id)) {
                continue;
            }

            const fallbackTitle = task.note_title?.trim() || task.path?.trim() || 'Untitled';
            merged.push({
                id: task.note_id,
                title: fallbackTitle,
                href: task.note_href?.trim() || task.href,
                slug: null,
                path: task.path,
                type: task.type,
                journal_granularity: task.journal_granularity ?? null,
                icon: task.icon ?? null,
                icon_color: task.icon_color ?? null,
                match_source: null,
                match_text: null,
                matchedTasks: tasksByNoteId.get(task.note_id) ?? [task],
            });
            seenNoteIds.add(task.note_id);
        }

        return merged;
    }, [noteItems, taskItems, shouldSearchTasks]);

    const toggleSearchTarget = (target: 'notes' | 'headings' | 'tasks') => {
        setSearchTargets((current) => {
            const next = {
                ...current,
                [target]: !current[target],
            };

            if (!next.notes && !next.headings && !next.tasks) {
                return current;
            }

            return next;
        });
    };

    const toggleTaskStatus = (status: TaskStatusFilter) => {
        setTaskStatuses((current) => {
            const isSelected = current.includes(status);
            if (isSelected) {
                const next = current.filter((entry) => entry !== status);
                return next.length === 0 ? current : next;
            }

            return [...current, status];
        });
    };

    const toggleNoteTypeFilter = (type: 'regular' | 'journal' | 'meeting') => {
        setNoteTypeFilters((current) => ({
            ...current,
            [type]: !current[type],
        }));
    };

    const scopePillClass = (active: boolean) =>
        cn(
            'inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors',
            active
                ? 'border-transparent bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
        );

    const scopePillClassSmall = (active: boolean) =>
        cn(
            'inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-medium transition-colors',
            active
                ? 'border-transparent bg-primary/10 text-primary'
                : 'border-border bg-background text-muted-foreground hover:text-foreground',
        );

    useEffect(() => {
        if (!open || isCommandMode || effectiveQuery === '' || !workspaceSlug) {
            setLoading(false);
            setNoteItems([]);
            setTaskItems([]);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            setLoading(true);

            try {
                const fetchItems = async () => {
                    const params = new URLSearchParams({
                        mode: 'notes',
                        include_notes: shouldSearchNotes ? '1' : '0',
                        include_regular: noteTypeFilters.regular ? '1' : '0',
                        include_journal: noteTypeFilters.journal ? '1' : '0',
                        include_meeting: noteTypeFilters.meeting ? '1' : '0',
                        include_headings: shouldSearchHeadings ? '1' : '0',
                        include_tasks: shouldSearchTasks ? '1' : '0',
                        limit: '40',
                    });
                    if (effectiveQuery !== '') {
                        params.set('q', effectiveQuery);
                    }
                    if (shouldSearchTasks) {
                        taskStatuses.forEach((status) => {
                            params.append('task_statuses[]', status);
                        });
                    }

                    const response = await fetch(`/w/${workspaceSlug}/search/command?${params.toString()}`, {
                        method: 'GET',
                        credentials: 'same-origin',
                        signal: controller.signal,
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                    });

                    if (!response.ok) {
                        throw new Error('Search failed');
                    }

                    const payload = (await response.json()) as {
                        mode: 'notes';
                        items?: unknown[];
                        tasks?: unknown[];
                    };

                    return {
                        items: Array.isArray(payload.items) ? payload.items : [],
                        tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
                    };
                };

                const result = shouldRunScopedSearch
                    ? await fetchItems()
                    : { items: [] as unknown[], tasks: [] as unknown[] };

                setNoteItems(result.items as NoteSearchItem[]);
                setTaskItems(result.tasks as TaskSearchItem[]);
            } catch {
                if (controller.signal.aborted) {
                    return;
                }

                setNoteItems([]);
                setTaskItems([]);
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }, 180);

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, [
        open,
        effectiveQuery,
        isCommandMode,
        noteTypeFilters.journal,
        noteTypeFilters.meeting,
        noteTypeFilters.regular,
        shouldSearchHeadings,
        shouldSearchNotes,
        shouldSearchTasks,
        shouldRunScopedSearch,
        taskStatuses,
        workspaceSlug,
    ]);

    return (
        <CommandDialog
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setQuery('');
                    setNoteItems([]);
                    setTaskItems([]);
                    setLoading(false);
                }
            }}
            title="Search notes"
            description="Find notes by title, path, or headings."
            className="top-[8%] translate-y-0 sm:top-[12%] sm:max-w-3xl"
            commandProps={{
                shouldFilter: false,
                value: selectedCommandValue,
                onValueChange: setSelectedCommandValue,
            }}
        >
            <div className="relative">
                <CommandInput
                    value={query}
                    onValueChange={(value) => {
                        setQuery(value);
                        if (value.trim() !== '') {
                            quickSwitchIndexRef.current = -1;
                            setSelectedCommandValue('');
                        }
                    }}
                    placeholder={
                        isCommandMode
                            ? t(
                                  'command_palette.command_placeholder',
                                  'Run command, e.g. :rename New title',
                              )
                            : shouldSearchNotes && shouldSearchHeadings
                            ? 'Search notes and headings...'
                            : shouldSearchTasks
                            ? 'Search tasks...'
                            : shouldSearchHeadings
                            ? 'Search headings...'
                            : 'Search notes (title, path)...'
                    }
                    className="pr-2"
                />
            </div>
            {!isCommandMode && (
                <div className="border-b">
                    <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                className={scopePillClass(searchTargets.notes)}
                                onClick={() => toggleSearchTarget('notes')}
                                aria-pressed={searchTargets.notes}
                            >
                                Notes
                            </button>
                            <button
                                type="button"
                                className={scopePillClass(searchTargets.headings)}
                                onClick={() => toggleSearchTarget('headings')}
                                aria-pressed={searchTargets.headings}
                            >
                                Headings
                            </button>
                            <button
                                type="button"
                                className={scopePillClass(searchTargets.tasks)}
                                onClick={() => toggleSearchTarget('tasks')}
                                aria-pressed={searchTargets.tasks}
                            >
                                Tasks
                            </button>
                        </div>
                        <button
                            type="button"
                            className={cn(
                                'inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
                                showMoreFilters
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                            )}
                            onClick={() => setShowMoreFilters((value) => !value)}
                            aria-expanded={showMoreFilters}
                        >
                            More
                            {showMoreFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                    {showMoreFilters && (
                        <div className="border-t px-3 pb-3 pt-2">
                            <div className="mb-2 text-xs text-muted-foreground">
                                Notes: regular, journal, meeting
                            </div>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    className={scopePillClassSmall(noteTypeFilters.regular)}
                                    onClick={() => toggleNoteTypeFilter('regular')}
                                    aria-pressed={noteTypeFilters.regular}
                                >
                                    Regular
                                </button>
                                <button
                                    type="button"
                                    className={scopePillClassSmall(noteTypeFilters.journal)}
                                    onClick={() => toggleNoteTypeFilter('journal')}
                                    aria-pressed={noteTypeFilters.journal}
                                >
                                    Journal
                                </button>
                                <button
                                    type="button"
                                    className={scopePillClassSmall(noteTypeFilters.meeting)}
                                    onClick={() => toggleNoteTypeFilter('meeting')}
                                    aria-pressed={noteTypeFilters.meeting}
                                >
                                    Meeting
                                </button>
                            </div>
                            <div className="mb-2 text-xs text-muted-foreground">
                                Tasks: open, in progress, assigned, starred, deferred (default)
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {ALL_TASK_STATUSES.map((status) => (
                                    <button
                                        key={status}
                                        type="button"
                                        className={scopePillClassSmall(taskStatuses.includes(status))}
                                        onClick={() => toggleTaskStatus(status)}
                                        aria-pressed={taskStatuses.includes(status)}
                                    >
                                        {TASK_STATUS_LABELS[status]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
            <CommandList className="max-h-120">
                <CommandEmpty>
                    {isCommandMode
                        ? commandDefinitions.some((command) => command.available)
                            ? t(
                                  'command_palette.no_commands',
                                  'No matching commands.',
                              )
                            : t(
                                  'command_palette.no_note_context',
                                  'Commands are only available while viewing a note.',
                              )
                        : loading
                        ? 'Searching...'
                        : shouldSearchNotes && shouldSearchHeadings
                            ? 'No results found.'
                          : shouldSearchTasks
                            ? 'No tasks found.'
                          : shouldSearchHeadings
                            ? 'No headings found.'
                          : 'No notes found.'}
                </CommandEmpty>
                {isCommandMode && commandDefinitions.some((command) => command.available) && (
                    <CommandGroup
                        heading={t('command_palette.commands_heading', 'Commands')}
                    >
                        {commandItems.map((command) => (
                            <CommandItem
                                key={command.id}
                                value={`${command.id} ${(command.aliases ?? []).join(' ')} ${command.label} ${command.syntax}`}
                                onSelect={() => {
                                    if (
                                        command.id === 'rename' && parsedCommand.args === ''
                                    ) {
                                        prefillCommandInput(command.id);
                                        return;
                                    }

                                    runCommand(command.id);
                                }}
                            >
                                <CommandIcon className="h-4 w-4" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate">{command.label}</div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {commandPreview(command)}
                                    </div>
                                </div>
                                <CommandShortcut>{command.syntax}</CommandShortcut>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
                {shouldShowRecent && (
                    <CommandGroup heading={t('command_palette.recent_heading', 'Recent')}>
                        {recentItems.map((item) => (
                                <CommandItem
                                    key={`recent-${item.id}`}
                                    value={`recent:${item.id}`}
                                    onSelect={() => {
                                        upsertRecentItem(item);
                                        setOpen(false);
                                        router.get(
                                            item.href,
                                            {},
                                            {
                                                preserveState: false,
                                                preserveScroll: false,
                                            },
                                        );
                                    }}
                                >
                                    {renderNoteIcon(item)}
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate">{item.title}</div>
                                        <div className="truncate text-xs text-muted-foreground">
                                            {item.path ?? item.slug ?? item.href}
                                        </div>
                                    </div>
                                    <CommandShortcut>↵</CommandShortcut>
                                </CommandItem>
                            ))}
                    </CommandGroup>
                )}
                {!isCommandMode &&
                    effectiveQuery !== '' &&
                    resultItems.map((item) => {
                        const navigate = (href: string) => {
                            upsertRecentItem({ ...item, href });
                            setOpen(false);
                            router.get(href, {}, { preserveState: false, preserveScroll: false });
                        };

                        const pathSegments = (item.path ?? '').split(' / ').filter(Boolean);
                        const parentPath = pathSegments.length > 1 ? pathSegments.slice(0, -1).join(' / ') : null;

                        const isSingleColumnMatch =
                            item.match_source === 'title' ||
                            item.match_source === 'path';

                        const hasTasks = item.matchedTasks.length > 0;
                        const groupHeading = (isSingleColumnMatch && !hasTasks) ? undefined : (
                            <div className="flex items-center gap-1.5">
                                {renderNoteIcon(item)}
                                <span className="text-foreground font-medium">{item.title}</span>
                                {parentPath && (
                                    <span className="text-muted-foreground/60 font-normal">{parentPath}</span>
                                )}
                            </div>
                        );

                        // Build a flat list of rows: each has a heading label and content to render.
                        // Consecutive rows sharing the same heading only show it on the first.
                        type MatchRow =
                            | { kind: 'note' }
                            | { kind: 'task'; task: TaskSearchItem };

                        const rows: MatchRow[] = [];
                        if (item.match_source !== null) {
                            rows.push({ kind: 'note' });
                        }
                        for (const task of item.matchedTasks) {
                            rows.push({ kind: 'task', task });
                        }

                        // Derive the section heading label for two-column rows only
                        const headingFor = (row: MatchRow): string | null => {
                            if (row.kind === 'note') {
                                return item.match_source === 'content' ? (item.match_heading ?? null) : null;
                            }
                            return row.task.section_heading ?? null;
                        };

                        return (
                            <CommandGroup key={item.id} heading={groupHeading}>
                                {rows.map((row, rowIndex) => {
                                    const heading = headingFor(row);
                                    const prevHeading = rowIndex > 0 ? headingFor(rows[rowIndex - 1]) : undefined;
                                    const showHeading = heading !== null && heading !== prevHeading;

                                    if (row.kind === 'note') {
                                        const href =
                                            item.match_source === 'heading' &&
                                            typeof item.match_block_id === 'string' &&
                                            item.match_block_id.trim() !== ''
                                                ? `${item.href}#${item.match_block_id}`
                                                : item.href;

                                        // Title match: standalone → full row; with tasks → heading-style row inside group
                                        if (item.match_source === 'title') {
                                            if (hasTasks) {
                                                return (
                                                    <CommandItem
                                                        key={`${item.id}-note`}
                                                        value={`${item.id} ${item.title}`}
                                                        onSelect={() => navigate(href)}
                                                    >
                                                        <div className="flex min-w-0 flex-1 items-start gap-3">
                                                            <div className="w-36 shrink-0 flex items-start justify-end pt-px">
                                                                <Heading className="w-3 h-3 mt-px shrink-0 text-muted-foreground/40" />
                                                            </div>
                                                            <div className="mt-0.5 w-px self-stretch shrink-0 bg-border" />
                                                            <div className="min-w-0 flex-1">
                                                                {renderHighlightedText(item.title, 'text-sm line-clamp-3')}
                                                            </div>
                                                        </div>
                                                        <CommandShortcut>↵</CommandShortcut>
                                                    </CommandItem>
                                                );
                                            }

                                            return (
                                                <CommandItem
                                                    key={`${item.id}-note`}
                                                    value={`${item.id} ${item.title}`}
                                                    onSelect={() => navigate(href)}
                                                >
                                                    {renderNoteIcon(item)}
                                                    <div className="min-w-0 flex-1">
                                                        {renderHighlightedText(item.title, 'truncate block text-sm font-medium')}
                                                        {parentPath && (
                                                            <span className="truncate block text-sm text-muted-foreground">{parentPath}</span>
                                                        )}
                                                    </div>
                                                    <CommandShortcut>↵</CommandShortcut>
                                                </CommandItem>
                                            );
                                        }

                                        // Path match: standalone → full row; with tasks → heading-style row inside group
                                        if (item.match_source === 'path') {
                                            if (hasTasks) {
                                                return (
                                                    <CommandItem
                                                        key={`${item.id}-note`}
                                                        value={`${item.id} ${item.title} ${item.match_text ?? ''}`}
                                                        onSelect={() => navigate(href)}
                                                    >
                                                        <div className="flex min-w-0 flex-1 items-start gap-3">
                                                            <div className="w-36 shrink-0 flex items-start justify-end pt-px">
                                                                <Heading className="w-3 h-3 mt-px shrink-0 text-muted-foreground/40" />
                                                            </div>
                                                            <div className="mt-0.5 w-px self-stretch shrink-0 bg-border" />
                                                            <div className="min-w-0 flex-1">
                                                                {renderHighlightedText(item.title, 'text-sm line-clamp-3')}
                                                            </div>
                                                        </div>
                                                        <CommandShortcut>↵</CommandShortcut>
                                                    </CommandItem>
                                                );
                                            }

                                            return (
                                                <CommandItem
                                                    key={`${item.id}-note`}
                                                    value={`${item.id} ${item.title} ${item.match_text ?? ''}`}
                                                    onSelect={() => navigate(href)}
                                                >
                                                    {renderNoteIcon(item)}
                                                    <div className="min-w-0 flex-1">
                                                        <span className="truncate block text-sm font-medium">{item.title}</span>
                                                        {item.match_text && (
                                                            renderHighlightedText(item.match_text, 'truncate block text-sm text-muted-foreground')
                                                        )}
                                                    </div>
                                                    <CommandShortcut>↵</CommandShortcut>
                                                </CommandItem>
                                            );
                                        }

                                        // Heading match: indented single-column with hash prefix
                                        if (item.match_source === 'heading') {
                                            return (
                                                <CommandItem
                                                    key={`${item.id}-note`}
                                                    value={`${item.id} ${item.title} ${item.match_text ?? ''}`}
                                                    onSelect={() => navigate(href)}
                                                >
                                                    <div className="flex min-w-0 flex-1 items-start gap-3">
                                                        <div className="w-36 shrink-0 flex items-start justify-end pt-px">
                                                            <Heading className="w-3 h-3 mt-px shrink-0 text-muted-foreground/40" />
                                                        </div>
                                                        <div className="mt-0.5 w-px self-stretch shrink-0 bg-border" />
                                                        <div className="min-w-0 flex-1">
                                                            {renderHighlightedText(item.match_text ?? item.title, 'text-sm line-clamp-3')}
                                                        </div>
                                                    </div>
                                                    <CommandShortcut>↵</CommandShortcut>
                                                </CommandItem>
                                            );
                                        }

                                        // Content match: two-column layout
                                        const contentLines = item.match_source === 'content' && item.match_text
                                            ? item.match_text.split('\n').filter((l) => l.trim() !== '')
                                            : [];
                                        const matchingLines = contentLines.filter((l) =>
                                            l.toLowerCase().includes(effectiveQuery.toLowerCase()),
                                        );
                                        const snippetLines = (matchingLines.length > 0 ? matchingLines : contentLines).slice(0, 3);

                                        return (
                                            <CommandItem
                                                key={`${item.id}-note`}
                                                value={`${item.id} ${item.title} ${item.match_text ?? ''}`}
                                                onSelect={() => navigate(href)}
                                            >
                                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                                    <div className="w-36 shrink-0 pt-px text-right text-sm text-muted-foreground/70 line-clamp-2">
                                                        {showHeading ? heading : ''}
                                                    </div>
                                                    <div className="mt-0.5 w-px self-stretch shrink-0 bg-border" />
                                                    <div className="min-w-0 flex-1">
                                                        {snippetLines.length > 0 ? (
                                                            <div className="space-y-0.5">
                                                                {snippetLines.map((line, i) => (
                                                                    <div key={i}>
                                                                        {renderHighlightedText(line.trim(), 'block text-sm text-muted-foreground')}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <CommandShortcut>↵</CommandShortcut>
                                            </CommandItem>
                                        );
                                    }

                                    const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
                                        open: 'text-muted-foreground/60',
                                        in_progress: 'text-amber-500',
                                        assigned: 'text-blue-500',
                                        starred: 'text-yellow-500',
                                        migrated: 'text-violet-400',
                                        canceled: 'text-muted-foreground/40',
                                        completed: 'text-emerald-500',
                                        deferred: 'text-muted-foreground/50',
                                        backlog: 'text-muted-foreground/50',
                                    };

                                    const { task } = row;
                                    const displayStatus = resolveTaskStatusForDisplay(task);
                                    const statusMeta = TASK_STATUS_ICONS[displayStatus];
                                    const StatusIcon = statusMeta.icon;
                                    const taskText = task.task_title?.trim() || task.title?.trim() || 'Task';

                                    return (
                                        <CommandItem
                                            key={`${item.id}-task-${task.id}`}
                                            value={`${item.id} task ${task.id} ${taskText}`}
                                            onSelect={() => navigate(task.href)}
                                        >
                                            <div className="flex min-w-0 flex-1 items-start gap-3">
                                                <div className="w-36 shrink-0 flex items-start justify-end gap-1 pt-px">
                                                    <span className="line-clamp-2 text-sm text-muted-foreground/70 text-right min-w-0">
                                                        {showHeading ? heading : ''}
                                                    </span>
                                                    <StatusIcon className={cn('w-3 h-3 mt-px shrink-0', TASK_STATUS_COLORS[displayStatus])} aria-hidden="true" />
                                                </div>
                                                <div className="mt-0.5 w-px self-stretch shrink-0 bg-border" />
                                                <div className="min-w-0 flex-1">
                                                    {renderHighlightedText(taskText, 'text-sm text-muted-foreground line-clamp-3')}
                                                </div>
                                            </div>
                                            <CommandShortcut>↵</CommandShortcut>
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        );
                    })}
            </CommandList>
        </CommandDialog>
    );
}
