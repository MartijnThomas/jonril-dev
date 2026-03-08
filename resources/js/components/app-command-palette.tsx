import { router, usePage } from '@inertiajs/react';
import {
    CalendarDays,
    ChevronDown,
    ChevronUp,
    Command as CommandIcon,
    FileText,
    Hash,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
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
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

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
};

type HeadingSearchItem = {
    id: string;
    note_id: string;
    heading_id: string;
    heading: string;
    level: number | null;
    note_title: string;
    href: string;
    slug: string | null;
    path: string | null;
    type: string | null;
    journal_granularity?: string | null;
    icon?: string | null;
    icon_color?: string | null;
};

type NoteActionsContext = {
    id: string;
    title: string;
    type?: string | null;
    journal_granularity?: string | null;
    icon?: string | null;
    icon_color?: string | null;
    canRename: boolean;
    canDelete: boolean;
    canClear: boolean;
};

type RecentNoteItem = NoteSearchItem & {
    lastOpenedAt: number;
};

type CommandDefinition = {
    id: 'rename' | 'clear' | 'delete';
    aliases?: string[];
    label: string;
    syntax: string;
    description: string;
    available: boolean;
};

export function AppCommandPalette() {
    const page = usePage().props as {
        noteActions?: NoteActionsContext;
        currentWorkspace?: { id: string } | null;
    };
    const { t } = useI18n();
    const [open, setOpen] = useState(false);
    const [includeJournal, setIncludeJournal] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [noteItems, setNoteItems] = useState<NoteSearchItem[]>([]);
    const [headingItems, setHeadingItems] = useState<HeadingSearchItem[]>([]);
    const [recentItems, setRecentItems] = useState<RecentNoteItem[]>([]);
    const quickSwitchActiveRef = useRef(false);
    const quickSwitchPressCountRef = useRef(0);
    const quickSwitchIndexRef = useRef(-1);
    const [selectedCommandValue, setSelectedCommandValue] = useState('');
    const noteActions = page.noteActions ?? null;
    const workspaceId = page.currentWorkspace?.id ?? 'global';

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

            event.preventDefault();

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
    }, [open, query, recentItems]);

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
            setOpen(true);
        };

        window.addEventListener('open-command-palette', openHandler);

        return () => {
            window.removeEventListener('open-command-palette', openHandler);
        };
    }, []);

    const isCommandMode = query.trimStart().startsWith(':');
    const isHeadingMode = !isCommandMode && query.startsWith('# ');
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
        () => (isHeadingMode ? query.slice(2).trim() : query.trim()),
        [isHeadingMode, query],
    );
    const shouldShowRecent =
        !isCommandMode && !isHeadingMode && effectiveQuery === '';
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
                : `/notes/${noteActions.id}`;

        upsertRecentItem({
            id: noteActions.id,
            title: noteActions.title,
            href,
            slug: null,
            path: null,
            type:
                noteActions.type ??
                (href.startsWith('/journal/') ? 'journal' : 'note'),
            journal_granularity: noteActions.journal_granularity ?? null,
            icon: noteActions.icon ?? null,
            icon_color: noteActions.icon_color ?? null,
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [noteActions?.id, noteActions?.title, recentStorageKey]);

    const commandDefinitions = useMemo<CommandDefinition[]>(
        () => [
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
        [noteActions?.canClear, noteActions?.canDelete, noteActions?.canRename, t],
    );

    const renderNoteIcon = (item: Pick<NoteSearchItem, 'type' | 'icon' | 'icon_color'>) => {
        const fallback = item.type === 'journal' ? CalendarDays : FileText;
        const IconComponent = getLucideIconComponent(item.icon ?? null, fallback);
        const colorClass = getColorTextClass(item.icon_color ?? 'black');

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
        if (!noteActions) {
            return;
        }

        const noteId = noteActions.id;

        const normalizedCommand: CommandDefinition['id'] =
            commandId === 'clear' || commandId === 'delete' || commandId === 'rename'
                ? commandId
                : parsedCommand.name === 'erase'
                  ? 'clear'
                  : parsedCommand.name === 'remove'
                    ? 'delete'
                    : parsedCommand.name === 'r'
                      ? 'rename'
                      : parsedCommand.name === 'c'
                        ? 'clear'
                        : parsedCommand.name === 'd'
                          ? 'delete'
                          : commandId;

        if (normalizedCommand === 'rename') {
            const title = parsedCommand.args;
            if (title === '') {
                return;
            }

            setOpen(false);
            router.patch(
                `/notes/${noteId}/rename`,
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
                `/notes/${noteId}/clear`,
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
        router.delete(`/notes/${noteId}`, {
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
            noteActions?.title?.trim() !== ''
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

    useEffect(() => {
        if (!open || isCommandMode || effectiveQuery === '') {
            setLoading(false);
            setNoteItems([]);
            setHeadingItems([]);
            return;
        }

        const controller = new AbortController();
        const timeoutId = window.setTimeout(async () => {
            setLoading(true);

            const params = new URLSearchParams({
                mode: isHeadingMode ? 'headings' : 'notes',
                include_journal: includeJournal ? '1' : '0',
                limit: '40',
            });
            if (effectiveQuery !== '') {
                params.set('q', effectiveQuery);
            }

            try {
                const response = await fetch(`/search/command?${params.toString()}`, {
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
                    mode: 'notes' | 'headings';
                    items?: unknown[];
                };
                const items = Array.isArray(payload.items) ? payload.items : [];

                if (payload.mode === 'headings') {
                    setHeadingItems(items as HeadingSearchItem[]);
                    setNoteItems([]);
                } else {
                    setNoteItems(items as NoteSearchItem[]);
                    setHeadingItems([]);
                }
            } catch {
                if (controller.signal.aborted) {
                    return;
                }

                setNoteItems([]);
                setHeadingItems([]);
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
    }, [open, includeJournal, isHeadingMode, effectiveQuery, isCommandMode]);

    const headingLevelIcon = (level: number | null) => {
        switch (level) {
            case 1:
                return Heading1;
            case 2:
                return Heading2;
            case 3:
                return Heading3;
            case 4:
                return Heading4;
            case 5:
                return Heading5;
            case 6:
                return Heading6;
            default:
                return Hash;
        }
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setQuery('');
                    setShowOptions(false);
                    setNoteItems([]);
                    setHeadingItems([]);
                    setLoading(false);
                }
            }}
            title="Search notes"
            description="Find notes by title, slug, or path."
            className="sm:max-w-xl"
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
                            : isHeadingMode
                            ? 'Search headings...'
                            : 'Search notes (title, slug, path)...'
                    }
                    className="pr-32"
                />
                {!isCommandMode && (
                    <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-10 inline-flex -translate-y-1/2 items-center gap-1 text-xs transition-colors"
                        onClick={() => setShowOptions((value) => !value)}
                        aria-expanded={showOptions}
                        aria-label="Toggle search options"
                    >
                        Options
                        {showOptions ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                        )}
                    </button>
                )}
            </div>
            {!isCommandMode && showOptions && (
                <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
                    <span>Include journal notes</span>
                    <Switch
                        size="sm"
                        checked={includeJournal}
                        onCheckedChange={setIncludeJournal}
                        aria-label="Include journal notes"
                    />
                </div>
            )}
            <CommandList>
                <CommandEmpty>
                    {isCommandMode
                        ? noteActions
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
                        : isHeadingMode
                          ? 'No headings found.'
                          : 'No notes found.'}
                </CommandEmpty>
                {isCommandMode && noteActions && (
                    <CommandGroup
                        heading={t('command_palette.commands_heading', 'Commands')}
                    >
                        {commandItems.map((command) => (
                            <CommandItem
                                key={command.id}
                                value={`${command.id} ${(command.aliases ?? []).join(' ')} ${command.label} ${command.syntax}`}
                                onSelect={() => {
                                    if (command.id === 'rename' && parsedCommand.args === '') {
                                        prefillCommandInput('rename');
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
                {!isHeadingMode && !isCommandMode && effectiveQuery !== '' && (
                    <CommandGroup heading="Notes">
                        {noteItems.map((item) => (
                            <CommandItem
                                key={item.id}
                                value={`${item.title} ${item.slug ?? ''} ${item.path ?? ''}`}
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
                {isHeadingMode && (
                    <CommandGroup heading="Headings">
                        {headingItems.map((item) => (
                            <CommandItem
                                key={item.id}
                                value={`# ${item.heading} ${item.note_title} ${item.slug ?? ''} ${item.path ?? ''}`}
                                onSelect={() => {
                                    upsertRecentItem({
                                        id: item.note_id,
                                        title: item.note_title,
                                        href: item.href,
                                        slug: item.slug,
                                        path: item.path,
                                        type: item.type,
                                        journal_granularity:
                                            item.journal_granularity ?? null,
                                        icon: item.icon ?? null,
                                        icon_color: item.icon_color ?? null,
                                    });
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
                                {(() => {
                                    const Icon = headingLevelIcon(item.level);
                                    return <Icon className="h-4 w-4" />;
                                })()}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate">{item.heading}</div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        {item.note_title}
                                        {item.path ? ` · ${item.path}` : ''}
                                    </div>
                                </div>
                                <CommandShortcut>↵</CommandShortcut>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}
            </CommandList>
        </CommandDialog>
    );
}
