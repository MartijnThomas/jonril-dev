import { router, usePage } from '@inertiajs/react';
import { BookOpen, Check, ChevronsUpDown } from 'lucide-react';
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

type ParentOption = {
    id: string;
    title: string;
    path?: string | null;
    is_journal?: boolean;
};

type AttachMeetingNoteDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    eventBlockId: string;
    eventTitle?: string;
    /** Pre-selected note to attach. When null, a note picker is shown. */
    noteId?: string | null;
    /** Title of the pre-selected note (shown read-only when noteId is set). */
    noteTitle?: string | null;
};

function NoteCombobox({
    options,
    value,
    onChange,
    placeholder,
    emptyText,
}: {
    options: (NoteOption | ParentOption)[];
    value: string;
    onChange: (id: string) => void;
    placeholder: string;
    emptyText: string;
}) {
    const [open, setOpen] = useState(false);
    const selected = options.find((o) => o.id === value) ?? null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    <span className="truncate text-left">
                        {selected
                            ? (selected.path
                                ? `${selected.path} / ${selected.title}`
                                : selected.title)
                            : <span className="text-muted-foreground">{placeholder}</span>}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search…" />
                    <CommandList>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                            {options.map((option) => {
                                const isJournal = 'is_journal' in option && option.is_journal;
                                const label = option.path
                                    ? `${option.path} / ${option.title}`
                                    : option.title;
                                return (
                                    <CommandItem
                                        key={option.id}
                                        value={label}
                                        onSelect={() => {
                                            onChange(option.id);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 size-4 shrink-0',
                                                value === option.id ? 'opacity-100' : 'opacity-0',
                                            )}
                                        />
                                        {isJournal ? (
                                            <BookOpen className="mr-1.5 size-3.5 shrink-0 text-muted-foreground" />
                                        ) : null}
                                        <span className="truncate">{label}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function AttachMeetingNoteDialog({
    open,
    onOpenChange,
    eventBlockId,
    eventTitle = '',
    noteId = null,
    noteTitle = null,
}: AttachMeetingNoteDialogProps) {
    const pageProps = usePage().props as {
        workspaceLinkableNotes?: NoteOption[];
        workspaceMeetingParentOptions?: ParentOption[];
    };

    const allNoteOptions: NoteOption[] = pageProps.workspaceLinkableNotes ?? [];
    const allParentOptions: ParentOption[] = pageProps.workspaceMeetingParentOptions ?? [];

    const [selectedNoteId, setSelectedNoteId] = useState<string>(noteId ?? '');
    const [parentId, setParentId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    const resolvedNoteId = noteId ?? selectedNoteId;

    // Exclude the note-to-attach from parent options and vice versa to prevent cycles.
    const noteOptions = allNoteOptions.filter((o) => o.id !== parentId);
    const parentOptions = allParentOptions.filter((o) => o.id !== resolvedNoteId);
    const canSubmit = Boolean(resolvedNoteId) && Boolean(parentId);

    const handleSubmit = () => {
        if (!canSubmit) {
            return;
        }

        setSubmitting(true);

        router.patch(
            `/notes/${resolvedNoteId}/attach-to-event`,
            { event_block_id: eventBlockId, parent_id: parentId },
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
                    <DialogTitle>Attach note as meeting note</DialogTitle>
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

                    {noteId && noteTitle ? (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Note</Label>
                            <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                                {noteTitle}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Note</Label>
                            <NoteCombobox
                                options={noteOptions}
                                value={selectedNoteId}
                                onChange={setSelectedNoteId}
                                placeholder="Select a note…"
                                emptyText="No notes found."
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Attach under</Label>
                        <NoteCombobox
                            options={parentOptions}
                            value={parentId}
                            onChange={setParentId}
                            placeholder="Select a parent note…"
                            emptyText="No notes found."
                        />
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
                    <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                        Attach as meeting note
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
