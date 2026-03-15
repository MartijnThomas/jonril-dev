import { router, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

type ParentOption = {
    id: string;
    title: string;
    path?: string | null;
};

type CreateMeetingNoteDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultTitle?: string;
    eventId?: string;
};

export function CreateMeetingNoteDialog({
    open,
    onOpenChange,
    defaultTitle = '',
    eventId,
}: CreateMeetingNoteDialogProps) {
    const pageProps = usePage().props as {
        linkableNotes?: ParentOption[];
        moveParentOptions?: ParentOption[];
    };

    const parentOptions: ParentOption[] = (
        pageProps.moveParentOptions ?? pageProps.linkableNotes ?? []
    ).slice();

    const [parentId, setParentId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    const handleCreate = () => {
        if (!parentId) {
            return;
        }

        setSubmitting(true);

        router.visit('/notes/create', {
            method: 'get',
            data: {
                title: defaultTitle,
                parent_id: parentId,
                type: 'meeting',
                ...(eventId ? { event_block_id: eventId } : {}),
            },
            onFinish: () => {
                setSubmitting(false);
                onOpenChange(false);
            },
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create meeting note</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Title</Label>
                        <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
                            {defaultTitle || <span className="text-muted-foreground italic">Untitled</span>}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="meeting-parent" className="text-xs text-muted-foreground">
                            Parent note
                        </Label>
                        <Select value={parentId} onValueChange={setParentId}>
                            <SelectTrigger id="meeting-parent" className="w-full">
                                <SelectValue placeholder="Select a parent note…" />
                            </SelectTrigger>
                            <SelectContent>
                                {parentOptions.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                        <span className="truncate">
                                            {option.path
                                                ? `${option.path} / ${option.title}`
                                                : option.title}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
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
                    <Button
                        onClick={handleCreate}
                        disabled={!parentId || submitting}
                    >
                        Create meeting note
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
