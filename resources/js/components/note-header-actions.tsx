import { router } from '@inertiajs/react';
import {
    Eraser,
    ExternalLink,
    FolderInput,
    MoreVertical,
    Pencil,
    TableProperties,
    Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { MoveNoteDialog } from '@/components/move-note-dialog';
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
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

type Props = {
    noteId: string;
    title: string;
    currentLocation?: string | null;
    currentParentId?: string | null;
    moveParentOptions?: Array<{ id: string; title: string; path: string }>;
    canMove: boolean;
    canRename: boolean;
    canDelete: boolean;
    canClear: boolean;
    canOpenBlockPreview?: boolean;
    blockPreviewUrl?: string | null;
    triggerClassName?: string;
    triggerIconClassName?: string;
    dropdownAlign?: 'start' | 'center' | 'end';
    dropdownSide?: 'top' | 'right' | 'bottom' | 'left';
    listenForMoveEvent?: boolean;
    enablePropertiesToggle?: boolean;
};

export function NoteHeaderActions({
    noteId,
    title,
    currentLocation,
    currentParentId,
    moveParentOptions = [],
    canMove,
    canRename,
    canDelete,
    canClear,
    canOpenBlockPreview = false,
    blockPreviewUrl = null,
    triggerClassName,
    triggerIconClassName = 'h-4 w-4',
    dropdownAlign = 'start',
    dropdownSide = 'bottom',
    listenForMoveEvent = true,
    enablePropertiesToggle = false,
}: Props) {
    const { t } = useI18n();
    const [renameOpen, setRenameOpen] = useState(false);
    const [moveOpen, setMoveOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [propertiesVisible, setPropertiesVisible] = useState(true);
    const [nextTitle, setNextTitle] = useState(title);
    const [processing, setProcessing] = useState(false);

    useEffect(() => {
        if (!listenForMoveEvent) {
            return;
        }

        const openMoveDialog = () => {
            if (canMove) {
                setMoveOpen(true);
            }
        };

        window.addEventListener('open-move-note-dialog', openMoveDialog);

        return () => {
            window.removeEventListener('open-move-note-dialog', openMoveDialog);
        };
    }, [canMove, listenForMoveEvent]);

    useEffect(() => {
        if (!enablePropertiesToggle) {
            return;
        }

        const handlePropertiesState = (event: Event) => {
            const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
            if (typeof detail?.visible === 'boolean') {
                setPropertiesVisible(detail.visible);
            }
        };

        window.addEventListener(
            'note-properties-visibility-state',
            handlePropertiesState,
        );

        return () => {
            window.removeEventListener(
                'note-properties-visibility-state',
                handlePropertiesState,
            );
        };
    }, [enablePropertiesToggle]);

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

    const togglePropertiesVisibility = () => {
        window.dispatchEvent(new Event('note-properties-toggle-request'));
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={triggerClassName ?? 'h-7 w-7'}
                        aria-label={t('note_actions.menu_aria', 'Note actions')}
                    >
                        <MoreVertical className={triggerIconClassName} />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={dropdownAlign} side={dropdownSide}>
                    {enablePropertiesToggle ? (
                        <>
                            <DropdownMenuItem
                                onClick={togglePropertiesVisibility}
                                className="flex items-center justify-between gap-3"
                            >
                                <span className="inline-flex flex-1 items-center gap-2">
                                    <TableProperties className="h-4 w-4 shrink-0 rotate-180" />
                                    {t('note_actions.properties', 'Properties')}
                                </span>
                                <span
                                    aria-hidden="true"
                                    className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
                                        propertiesVisible
                                            ? 'bg-foreground/30'
                                            : 'bg-muted-foreground/20'
                                    }`}
                                >
                                    <span
                                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-background shadow-[0_0_0_1px_rgba(0,0,0,0.08)] transition-transform ${
                                            propertiesVisible
                                                ? 'translate-x-3.5'
                                                : 'translate-x-0.5'
                                        }`}
                                    />
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                        </>
                    ) : null}
                    {canMove ? (
                        <DropdownMenuItem onClick={() => setMoveOpen(true)}>
                            <span className="inline-flex flex-1 items-center gap-2">
                                <FolderInput className="h-4 w-4 shrink-0" />
                                {t('note_actions.move', 'Move note')}
                            </span>
                        </DropdownMenuItem>
                    ) : null}
                    {canRename ? (
                        <DropdownMenuItem
                            onClick={() => {
                                setNextTitle(title);
                                setRenameOpen(true);
                            }}
                        >
                            <span className="inline-flex flex-1 items-center gap-2">
                                <Pencil className="h-4 w-4 shrink-0" />
                                {t('note_actions.rename', 'Rename note')}
                            </span>
                        </DropdownMenuItem>
                    ) : null}
                    {canClear ? (
                        <DropdownMenuItem onClick={() => setClearOpen(true)}>
                            <span className="inline-flex flex-1 items-center gap-2">
                                <Eraser className="h-4 w-4 shrink-0" />
                                {t('note_actions.clear', 'Erase note')}
                            </span>
                        </DropdownMenuItem>
                    ) : null}
                    {canDelete ? (
                        <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteOpen(true)}
                        >
                            <span className="inline-flex flex-1 items-center gap-2">
                                <Trash2 className="h-4 w-4 shrink-0" />
                                {t('note_actions.delete', 'Delete note')}
                            </span>
                        </DropdownMenuItem>
                    ) : null}
                    {canOpenBlockPreview && blockPreviewUrl ? (
                        <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                                <a
                                    href={blockPreviewUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex w-full items-center gap-2"
                                >
                                    <ExternalLink className="h-4 w-4 shrink-0" />
                                    <span>
                                        {t(
                                            'note_actions.open_block_preview',
                                            'Open in block mode',
                                        )}
                                    </span>
                                </a>
                            </DropdownMenuItem>
                        </>
                    ) : null}
                </DropdownMenuContent>
            </DropdownMenu>

            {canMove ? (
                <MoveNoteDialog
                    open={moveOpen}
                    onOpenChange={setMoveOpen}
                    noteId={noteId}
                    currentLocation={currentLocation ?? null}
                    currentParentId={currentParentId ?? null}
                    options={moveParentOptions}
                />
            ) : null}

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
