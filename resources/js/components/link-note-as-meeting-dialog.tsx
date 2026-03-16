import { router, usePage } from '@inertiajs/react';
import { useState } from 'react';
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
    const [submitting, setSubmitting] = useState(false);

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
                        <NoteLocationCombobox
                            value={noteId}
                            onChange={setNoteId}
                            options={noteOptions}
                            placeholder="Select a note…"
                            searchPlaceholder="Search notes…"
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
                    <Button onClick={handleLink} disabled={!noteId || submitting}>
                        Link as meeting note
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
