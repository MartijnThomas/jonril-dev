import { router, usePage } from '@inertiajs/react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type NoteOption = {
    id: string;
    title: string;
    path?: string | null;
};

type LinkNoteAsMeetingDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventBlockId: string;
    eventTitle?: string;
};

export function LinkNoteAsMeetingDialog({
    open,
    onOpenChange,
    eventBlockId,
    eventTitle = '',
}: LinkNoteAsMeetingDialogProps) {
    const pageProps = usePage().props as {
        workspaceLinkableNotes?: NoteOption[];
        moveParentOptions?: NoteOption[];
    };

    const noteOptions: NoteOption[] = (
        pageProps.workspaceLinkableNotes ?? pageProps.moveParentOptions ?? []
    ).slice();

    const [noteId, setNoteId] = useState<string>('');
    const [comboboxOpen, setComboboxOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const selectedNote = noteOptions.find((n) => n.id === noteId) ?? null;

    const handleLink = () => {
        if (!noteId) {
            return;
        }

        setSubmitting(true);

        router.patch(
            `/notes/${noteId}/attach-to-event`,
            { event_block_id: eventBlockId },
            {
                preserveState: false,
                preserveScroll: true,
                onFinish: () => {
                    setSubmitting(false);
                    onOpenChange(false);
                },
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Link note as meeting note</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {eventTitle ? (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Event</Label>
                            <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                                {eventTitle}
                            </p>
                        </div>
                    ) : null}

                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Note</Label>
                        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={comboboxOpen}
                                    className="w-full justify-between font-normal"
                                >
                                    <span className="truncate text-left">
                                        {selectedNote
                                            ? (selectedNote.path
                                                ? `${selectedNote.path} / ${selectedNote.title}`
                                                : selectedNote.title)
                                            : 'Select a note…'}
                                    </span>
                                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search notes…" />
                                    <CommandList>
                                        <CommandEmpty>No notes found.</CommandEmpty>
                                        <CommandGroup>
                                            {noteOptions.map((option) => (
                                                <CommandItem
                                                    key={option.id}
                                                    value={option.path ? `${option.path} / ${option.title}` : option.title}
                                                    onSelect={() => {
                                                        setNoteId(option.id);
                                                        setComboboxOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            'mr-2 size-4',
                                                            noteId === option.id ? 'opacity-100' : 'opacity-0',
                                                        )}
                                                    />
                                                    <span className="truncate">
                                                        {option.path
                                                            ? `${option.path} / ${option.title}`
                                                            : option.title}
                                                    </span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button onClick={handleLink} disabled={!noteId || submitting}>
                        Link as meeting note
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
