import { router } from '@inertiajs/react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { loadNoteOptions } from '@/lib/note-options';
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
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type MoveParentOption = {
    id: string;
    title: string;
    path: string;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    noteId: string;
    workspaceSlug: string;
    currentLocation: string | null;
    currentParentId: string | null;
};

const ROOT_VALUE = '__root__';

export function MoveNoteDialog({
    open,
    onOpenChange,
    noteId,
    workspaceSlug,
    currentLocation,
    currentParentId,
}: Props) {
    const { t } = useI18n();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [options, setOptions] = useState<MoveParentOption[]>([]);
    const [selectedParentId, setSelectedParentId] = useState<string>(
        currentParentId ?? ROOT_VALUE,
    );

    useEffect(() => {
        if (!open) {
            return;
        }

        let cancelled = false;
        void loadNoteOptions({
            workspaceSlug,
            scope: 'move_parent',
            noteId,
            limit: 1000,
        }).then((loaded) => {
            if (cancelled) {
                return;
            }

            setOptions(loaded as MoveParentOption[]);
        });

        return () => {
            cancelled = true;
        };
    }, [noteId, open, workspaceSlug]);

    const normalizedOptions = useMemo(
        () =>
            options.map((option) => ({
                ...option,
                label: option.path || option.title,
            })),
        [options],
    );

    const selectedOptionLabel = useMemo(() => {
        if (selectedParentId === ROOT_VALUE) {
            return t('note_actions.move_root', 'Root');
        }

        const option = normalizedOptions.find((item) => item.id === selectedParentId);

        return option?.label ?? t('note_actions.move_pick_parent', 'Pick new parent');
    }, [normalizedOptions, selectedParentId, t]);

    const submit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (processing) {
            return;
        }

        setProcessing(true);
        router.patch(
            `/notes/${noteId}/move`,
            {
                parent_id: selectedParentId === ROOT_VALUE ? null : selectedParentId,
            },
            {
                preserveState: false,
                preserveScroll: true,
                onFinish: () => setProcessing(false),
                onSuccess: () => onOpenChange(false),
            },
        );
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(nextOpen) => {
                if (nextOpen) {
                    setSelectedParentId(currentParentId ?? ROOT_VALUE);
                }
                onOpenChange(nextOpen);
            }}
        >
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('note_actions.move', 'Move note')}</DialogTitle>
                    <DialogDescription>
                        {t(
                            'note_actions.move_description',
                            'Select a new parent note.',
                        )}
                    </DialogDescription>
                </DialogHeader>

                <form className="space-y-4" onSubmit={submit}>
                    <div className="grid gap-2">
                        <Label>{t('note_actions.current_path', 'Current location')}</Label>
                        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                            {currentLocation ?? t('note_actions.move_root', 'Root')}
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="move-note-parent">
                            {t('note_actions.new_parent', 'New location')}
                        </Label>
                        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    id="move-note-parent"
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between"
                                >
                                    <span className="truncate">{selectedOptionLabel}</span>
                                    <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                                <Command>
                                    <CommandInput
                                        placeholder={t(
                                            'note_actions.move_search',
                                            'Search parent note...',
                                        )}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {t(
                                                'note_actions.move_no_results',
                                                'No matching notes.',
                                            )}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value={`root ${t('note_actions.move_root', 'Root')}`}
                                                onSelect={() => {
                                                    setSelectedParentId(ROOT_VALUE);
                                                    setPickerOpen(false);
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        'mr-2 h-4 w-4',
                                                        selectedParentId === ROOT_VALUE
                                                            ? 'opacity-100'
                                                            : 'opacity-0',
                                                    )}
                                                />
                                                {t('note_actions.move_root', 'Root')}
                                            </CommandItem>
                                            {normalizedOptions.map((option) => (
                                                <CommandItem
                                                    key={option.id}
                                                    value={`${option.title} ${option.path}`}
                                                    onSelect={() => {
                                                        setSelectedParentId(option.id);
                                                        setPickerOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            'mr-2 h-4 w-4',
                                                            selectedParentId === option.id
                                                                ? 'opacity-100'
                                                                : 'opacity-0',
                                                        )}
                                                    />
                                                    <span className="truncate">
                                                        {option.label}
                                                    </span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            {t('note_actions.cancel', 'Cancel')}
                        </Button>
                        <Button type="submit" disabled={processing}>
                            {t('note_actions.move_action', 'Move')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
