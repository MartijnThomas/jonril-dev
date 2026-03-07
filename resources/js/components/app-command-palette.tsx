import { router, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronUp, FileText, Hash } from 'lucide-react';
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

export function AppCommandPalette() {
    const { noteSearchIndex = [] } = usePage().props as {
        noteSearchIndex?: NoteSearchItem[];
    };
    const [open, setOpen] = useState(false);
    const [includeJournal, setIncludeJournal] = useState(false);
    const [showOptions, setShowOptions] = useState(false);

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

    const items = useMemo(() => {
        return noteSearchIndex
            .filter((item) => includeJournal || item.type !== 'journal')
            .map((item) => ({
                ...item,
                searchable: `${item.id} ${item.title} ${item.slug ?? ''} ${item.path ?? ''}`.trim(),
            }));
    }, [includeJournal, noteSearchIndex]);

    return (
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            title="Search notes"
            description="Find notes by title, slug, or path."
            className="sm:max-w-xl"
        >
            <div className="relative">
                <CommandInput
                    placeholder="Search notes (title, slug, path)..."
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
                <CommandEmpty>No notes found.</CommandEmpty>
                <CommandGroup heading="Notes">
                    {items.map((item) => (
                        <CommandItem
                            key={item.id}
                            value={item.searchable}
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
            </CommandList>
        </CommandDialog>
    );
}
