import { router } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

type MigrateTarget = {
    key: string;
    title: string;
    path?: string;
    target_note_id?: string | null;
    target_journal_granularity?: string | null;
    target_journal_period?: string | null;
};

type TaskMigratePickerProps = {
    open: boolean;
    sourceNoteId: string;
    blockId: string | null;
    position: number | null;
    anchorPoint?: { x: number; y: number } | null;
    language: 'nl' | 'en';
    onClose: () => void;
    onMigrated: () => void;
};

export function TaskMigratePicker({
    open,
    sourceNoteId,
    blockId,
    position,
    anchorPoint = null,
    language,
    onClose,
    onMigrated,
}: TaskMigratePickerProps) {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<MigrateTarget[]>([]);
    const [loading, setLoading] = useState(false);
    const [submittingKey, setSubmittingKey] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const resetPickerState = useCallback(() => {
        setQuery('');
        setItems([]);
        setLoading(false);
        setSubmittingKey(null);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const controller = new AbortController();
        const params = new URLSearchParams({
            source_note_id: sourceNoteId,
            q: query,
            limit: '20',
        });

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLoading(true);

        fetch(`/tasks/migrate-targets?${params.toString()}`, {
            signal: controller.signal,
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error('Failed to load migrate targets.');
                }

                const payload = (await response.json()) as {
                    items?: MigrateTarget[];
                };
                setItems(Array.isArray(payload.items) ? payload.items : []);
            })
            .catch((error) => {
                if ((error as { name?: string }).name === 'AbortError') {
                    return;
                }

                setItems([]);
                toast.error(
                    language === 'en'
                        ? 'Failed to load migration targets.'
                        : 'Migratiedoelen laden is mislukt.',
                );
            })
            .finally(() => {
                setLoading(false);
            });

        return () => {
            controller.abort();
        };
    }, [language, open, query, sourceNoteId]);

    useEffect(() => {
        if (!open) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            resetPickerState();
        }
    }, [open, resetPickerState]);

    const canSubmit = useMemo(
        () => Boolean(blockId && blockId.trim() !== '') || (position ?? 0) > 0,
        [blockId, position],
    );

    const migrateTask = useCallback((item: MigrateTarget) => {
        if (!canSubmit || submittingKey) {
            return;
        }

        const payload: Record<string, string | number | null> = {
            source_note_id: sourceNoteId,
            block_id: blockId,
            position: position,
            target_note_id: item.target_note_id ?? null,
            target_journal_granularity: item.target_journal_granularity ?? null,
            target_journal_period: item.target_journal_period ?? null,
        };

        setSubmittingKey(item.key);

        router.post('/tasks/migrate', payload, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            onSuccess: () => {
                onClose();
                onMigrated();
                toast.success(
                    language === 'en'
                        ? 'Task migrated.'
                        : 'Taak gemigreerd.',
                );
            },
            onError: () => {
                toast.error(
                    language === 'en'
                        ? 'Failed to migrate task.'
                        : 'Taak migreren is mislukt.',
                );
            },
            onFinish: () => {
                setSubmittingKey(null);
            },
        });
    }, [blockId, canSubmit, language, onClose, onMigrated, position, sourceNoteId, submittingKey]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const raf = requestAnimationFrame(() => {
            inputRef.current?.focus();
        });

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown, { capture: true });

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('keydown', handleKeyDown, { capture: true });
        };
    }, [onClose, open]);

    const panelStyle = useMemo(() => {
        if (!open || !anchorPoint) {
            return {
                left: '50%',
                top: '6rem',
                transform: 'translateX(-50%)',
            } as const;
        }

        const panelWidth = Math.min(544, window.innerWidth - 32);
        const left = Math.min(
            Math.max(16, anchorPoint.x - panelWidth / 2),
            window.innerWidth - panelWidth - 16,
        );
        const top = Math.min(
            Math.max(16, anchorPoint.y + 10),
            window.innerHeight - 420,
        );

        return { left: `${left}px`, top: `${top}px` } as const;
    }, [anchorPoint, open]);

    if (!open) {
        return null;
    }

    return (
        <>
            <button
                type="button"
                aria-label="Close migrate picker"
                className="fixed inset-0 z-50 bg-transparent"
                onClick={onClose}
            />
            <div
                className="fixed z-[60] w-[34rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl"
                style={panelStyle}
            >
                <Command
                    shouldFilter={false}
                    className="max-h-[24rem]"
                >
                    <CommandInput
                        ref={inputRef}
                        value={query}
                        onValueChange={(value) => {
                            setQuery(value);
                        }}
                        placeholder={
                            language === 'en'
                                ? 'Migrate task to note...'
                                : 'Migreer taak naar notitie...'
                        }
                    />
                    <CommandList>
                        {loading ? (
                            <div className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {language === 'en' ? 'Loading...' : 'Laden...'}
                            </div>
                        ) : null}
                        {!loading ? (
                            <CommandEmpty>
                                {language === 'en'
                                    ? 'No notes found.'
                                    : 'Geen notities gevonden.'}
                            </CommandEmpty>
                        ) : null}
                        <CommandGroup
                            heading={
                                language === 'en'
                                    ? 'Migrate to'
                                    : 'Migreer naar'
                            }
                        >
                            {items.map((item) => (
                                <CommandItem
                                    key={item.key}
                                    value={`${item.title} ${item.path ?? ''}`}
                                    onSelect={() => migrateTask(item)}
                                    disabled={!canSubmit || Boolean(submittingKey)}
                                >
                                    <div className="flex w-full items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm">{item.title}</div>
                                            {item.path ? (
                                                <div className="text-muted-foreground truncate text-xs">
                                                    {item.path}
                                                </div>
                                            ) : null}
                                        </div>
                                        {submittingKey === item.key ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : null}
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </div>
        </>
    );
}
