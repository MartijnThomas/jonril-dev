import { router } from '@inertiajs/react';
import { Eraser, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

type Props = {
    noteId: string;
    title: string;
    canRename: boolean;
    canDelete: boolean;
    canClear: boolean;
};

export function NoteHeaderActions({
    noteId,
    title,
    canRename,
    canDelete,
    canClear,
}: Props) {
    const { t } = useI18n();
    const [renameOpen, setRenameOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [nextTitle, setNextTitle] = useState(title);
    const [processing, setProcessing] = useState(false);

    const submitRename = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (processing) {
            return;
        }

        setProcessing(true);
        router.patch(
            `/notes/${noteId}/rename`,
            { title: nextTitle },
            {
                preserveState: false,
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => setRenameOpen(false),
            },
        );
    };

    const confirmDelete = () => {
        if (processing) {
            return;
        }

        setProcessing(true);
        router.delete(`/notes/${noteId}`, {
            preserveState: false,
            preserveScroll: false,
            onFinish: () => setProcessing(false),
            onSuccess: () => setDeleteOpen(false),
        });
    };

    const confirmClear = () => {
        if (processing) {
            return;
        }

        setProcessing(true);
        router.patch(
            `/notes/${noteId}/clear`,
            {},
            {
                preserveState: false,
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => setClearOpen(false),
            },
        );
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        aria-label={t('note_actions.menu_aria', 'Note actions')}
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {canRename ? (
                        <DropdownMenuItem
                            onClick={() => {
                                setNextTitle(title);
                                setRenameOpen(true);
                            }}
                        >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('note_actions.rename', 'Rename note')}
                        </DropdownMenuItem>
                    ) : null}
                    {canClear ? (
                        <DropdownMenuItem onClick={() => setClearOpen(true)}>
                            <Eraser className="mr-2 h-4 w-4" />
                            {t('note_actions.clear', 'Erase note')}
                        </DropdownMenuItem>
                    ) : null}
                    {canDelete ? (
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteOpen(true)}
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('note_actions.delete', 'Delete note')}
                        </DropdownMenuItem>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('note_actions.rename', 'Rename note')}</DialogTitle>
                        <DialogDescription>
                            {t(
                                'note_actions.rename_description',
                                'This updates the note title and rebuilds its slug.',
                            )}
                        </DialogDescription>
                    </DialogHeader>

                    <form className="space-y-4" onSubmit={submitRename}>
                        <div className="grid gap-2">
                            <Label htmlFor="note-rename-title">
                                {t('note_actions.title_label', 'Title')}
                            </Label>
                            <Input
                                id="note-rename-title"
                                value={nextTitle}
                                onChange={(event) => setNextTitle(event.target.value)}
                                autoFocus
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setRenameOpen(false)}
                            >
                                {t('note_actions.cancel', 'Cancel')}
                            </Button>
                            <Button type="submit" disabled={processing}>
                                {t('note_actions.save', 'Save')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={clearOpen} onOpenChange={setClearOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('note_actions.clear', 'Erase note')}</DialogTitle>
                        <DialogDescription>
                            {t(
                                'note_actions.clear_description',
                                'This removes all content and erases all note properties.',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setClearOpen(false)}
                        >
                            {t('note_actions.cancel', 'Cancel')}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmClear}
                            disabled={processing}
                        >
                            {t('note_actions.clear_action', 'Erase')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('note_actions.delete', 'Delete note')}</DialogTitle>
                        <DialogDescription>
                            {t(
                                'note_actions.delete_description',
                                'This note will be soft deleted and can be restored from the database.',
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteOpen(false)}
                        >
                            {t('note_actions.cancel', 'Cancel')}
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            onClick={confirmDelete}
                            disabled={processing}
                        >
                            {t('note_actions.delete_action', 'Delete')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
