import { router, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';
import { NoteLocationCombobox } from '@/components/note-location-combobox';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

type NoteOption = {
    id: string;
    title: string;
    path?: string | null;
    parent_id?: string | null;
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

    const allNoteOptions = useMemo(
        () => pageProps.workspaceLinkableNotes ?? [],
        [pageProps.workspaceLinkableNotes],
    );
    const allParentOptions = useMemo(
        () => pageProps.workspaceMeetingParentOptions ?? [],
        [pageProps.workspaceMeetingParentOptions],
    );

    const [selectedNoteId, setSelectedNoteId] = useState<string>(noteId ?? '');
    const [parentId, setParentId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) {
            return;
        }

        setSelectedNoteId(noteId ?? '');

        if (noteId) {
            const option = allNoteOptions.find((o) => o.id === noteId);
            setParentId(option?.parent_id ?? '');
        } else {
            setParentId('');
        }
    }, [open, noteId, allNoteOptions]);

    const resolvedNoteId = noteId ?? selectedNoteId;

    // Exclude the note-to-attach from parent options and vice versa to prevent cycles.
    const noteOptions = allNoteOptions.filter((o) => o.id !== parentId);
    const parentOptions = allParentOptions.filter((o) => o.id !== resolvedNoteId);
    const canSubmit = Boolean(resolvedNoteId) && Boolean(parentId);
    const selectedReadOnlyNoteLabel = useMemo(() => {
        if (!noteId) {
            return null;
        }

        const selected = allNoteOptions.find((option) => option.id === noteId);
        if (selected) {
            return selected.path?.trim() || selected.title;
        }

        return noteTitle;
    }, [allNoteOptions, noteId, noteTitle]);

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

                    {noteId ? (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Note</Label>
                            <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                                {selectedReadOnlyNoteLabel ?? 'Selected note'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground">Note</Label>
                            <NoteLocationCombobox
                                options={noteOptions}
                                value={selectedNoteId}
                                onChange={setSelectedNoteId}
                                placeholder="Select a note…"
                                searchPlaceholder="Search notes…"
                                emptyText="No notes found."
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Attach under</Label>
                        <NoteLocationCombobox
                            options={parentOptions}
                            value={parentId}
                            onChange={setParentId}
                            placeholder="Select a parent note…"
                            searchPlaceholder="Search parent notes…"
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
