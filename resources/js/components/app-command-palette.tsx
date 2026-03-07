import { router } from '@inertiajs/react';
import {
    ChevronDown,
    ChevronUp,
    FileText,
    Hash,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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

type NoteSearchItem = {
    id: string;
    title: string;
    href: string;
    slug: string | null;
    path: string | null;
    type: string | null;
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
};

export function AppCommandPalette() {
    const [open, setOpen] = useState(false);
    const [includeJournal, setIncludeJournal] = useState(false);
    const [showOptions, setShowOptions] = useState(false);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [noteItems, setNoteItems] = useState<NoteSearchItem[]>([]);
    const [headingItems, setHeadingItems] = useState<HeadingSearchItem[]>([]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
                return;
            }

            event.preventDefault();
            setOpen((value) => !value);
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    useEffect(() => {
        const openHandler = () => {
            setOpen(true);
        };

        window.addEventListener('open-command-palette', openHandler);

        return () => {
            window.removeEventListener('open-command-palette', openHandler);
        };
    }, []);

    const isHeadingMode = query.startsWith('# ');
    const effectiveQuery = useMemo(
        () => (isHeadingMode ? query.slice(2).trim() : query.trim()),
        [isHeadingMode, query],
    );

    useEffect(() => {
        if (!open) {
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
    }, [open, includeJournal, isHeadingMode, effectiveQuery]);

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
        >
            <div className="relative">
                <CommandInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder={
                        isHeadingMode
                            ? 'Search headings...'
                            : 'Search notes (title, slug, path)...'
                    }
                    className="pr-32"
                />
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
            </div>
            {showOptions && (
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
                    {loading
                        ? 'Searching...'
                        : isHeadingMode
                          ? 'No headings found.'
                          : 'No notes found.'}
                </CommandEmpty>
                {!isHeadingMode && (
                    <CommandGroup heading="Notes">
                        {noteItems.map((item) => (
                            <CommandItem
                                key={item.id}
                                value={`${item.title} ${item.slug ?? ''} ${item.path ?? ''}`}
                                onSelect={() => {
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
                                {item.type === 'journal' ? (
                                    <Hash className="h-4 w-4" />
                                ) : (
                                    <FileText className="h-4 w-4" />
                                )}
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
