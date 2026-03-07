import { router, usePage } from '@inertiajs/react';
import { FileText, Hash } from 'lucide-react';
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

    const items = useMemo(() => {
        return noteSearchIndex.map((item) => ({
            ...item,
            searchable: `${item.id} ${item.title} ${item.slug ?? ''} ${item.path ?? ''}`.trim(),
        }));
    }, [noteSearchIndex]);

    return (
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            title="Search notes"
            description="Find notes by title, slug, or path."
            className="sm:max-w-xl"
        >
            <CommandInput placeholder="Search notes (title, slug, path)..." />
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
