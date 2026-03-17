import { router } from '@inertiajs/react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type CreateNoteParentOption = {
    id: string;
    title: string;
    path: string;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    parentOptions: CreateNoteParentOption[];
    defaultParentId?: string | null;
};

export function CreateNoteDialog({ open, onOpenChange, parentOptions, defaultParentId = null }: Props) {
    const { t } = useI18n();
    const [title, setTitle] = useState('');
    const [parentId, setParentId] = useState<string | null>(defaultParentId);
    const [processing, setProcessing] = useState(false);
    const [parentPopoverOpen, setParentPopoverOpen] = useState(false);
    const [parentQuery, setParentQuery] = useState('');

    const selectedParent = useMemo(
        () => parentOptions.find((option) => option.id === parentId) ?? null,
        [parentId, parentOptions],
    );

    const filteredParents = useMemo(() => {
        const query = parentQuery.trim().toLowerCase();
        if (query === '') {
            return parentOptions;
        }

        return parentOptions.filter((option) => {
            const haystack = `${option.path} ${option.title}`.toLowerCase();
            return haystack.includes(query);
        });
    }, [parentOptions, parentQuery]);

    useEffect(() => {
        if (open) {
            setTitle('');
            setParentId(defaultParentId ?? null);
            setParentPopoverOpen(false);
            setParentQuery('');
        }
    }, [open, defaultParentId]);

    const handleOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen);
    };

    const submitCreate = () => {
        const nextTitle = title.trim();
        if (nextTitle === '' || processing) {
            return;
        }

        setProcessing(true);
        router.post(
            '/notes',
            {
                title: nextTitle,
                ...(parentId ? { parent_id: parentId } : {}),
            },
            {
                preserveState: false,
                preserveScroll: false,
                onFinish: () => setProcessing(false),
                onSuccess: () => handleOpenChange(false),
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('notes_create.title', 'Create new note')}</DialogTitle>
                    <DialogDescription>
                        {t(
                            'notes_create.description',
                            'Choose a note name and optionally a parent.',
                        )}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid gap-2">
                        <Label htmlFor="create-note-title">
                            {t('notes_create.name_label', 'Note name')}
                        </Label>
                        <Input
                            id="create-note-title"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder={t('notes_create.name_placeholder', 'Untitled')}
                            autoFocus
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label>{t('notes_create.parent_label', 'Parent (optional)')}</Label>

                        <Popover open={parentPopoverOpen} onOpenChange={setParentPopoverOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={parentPopoverOpen}
                                    className="w-full justify-between font-normal"
                                >
                                    <span className="truncate text-left">
                                        {selectedParent
                                            ? selectedParent.path
                                            : t('notes_create.no_parent', 'No parent')}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                align="start"
                                className="w-[var(--radix-popover-trigger-width)] p-0"
                            >
                                <Command shouldFilter={false}>
                                    <CommandInput
                                        value={parentQuery}
                                        onValueChange={setParentQuery}
                                        placeholder={t(
                                            'notes_create.parent_search_placeholder',
                                            'Search parent note...',
                                        )}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {t(
                                                'notes_create.parent_no_results',
                                                'No matching notes.',
                                            )}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value="__none__"
                                                onSelect={() => {
                                                    setParentId(null);
                                                    setParentPopoverOpen(false);
                                                    setParentQuery('');
                                                }}
                                            >
                                                <Check
                                                    className={cn(
                                                        'mr-2 h-4 w-4',
                                                        parentId === null
                                                            ? 'opacity-100'
                                                            : 'opacity-0',
                                                    )}
                                                />
                                                {t('notes_create.no_parent', 'No parent')}
                                            </CommandItem>
                                            {filteredParents.map((option) => (
                                                <CommandItem
                                                    key={option.id}
                                                    value={`${option.title} ${option.path}`}
                                                    onSelect={() => {
                                                        setParentId(option.id);
                                                        setParentPopoverOpen(false);
                                                        setParentQuery('');
                                                    }}
                                                >
                                                    <Check
                                                        className={cn(
                                                            'mr-2 h-4 w-4',
                                                            parentId === option.id
                                                                ? 'opacity-100'
                                                                : 'opacity-0',
                                                        )}
                                                    />
                                                    <span className="truncate">{option.path}</span>
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
                        type="button"
                        variant="outline"
                        onClick={() => handleOpenChange(false)}
                    >
                        {t('notes_create.cancel', 'Cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={processing || title.trim() === ''}
                        onClick={submitCreate}
                    >
                        {t('notes_create.create', 'Create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

