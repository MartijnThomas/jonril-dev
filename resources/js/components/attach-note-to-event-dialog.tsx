import { router, usePage } from '@inertiajs/react';
import { format, isValid, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NoteLocationCombobox } from '@/components/note-location-combobox';
import type { NoteLocationOption } from '@/components/note-location-combobox';
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
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type AttachableEvent = {
    block_id: string;
    title: string;
    all_day: boolean;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
    timezone: string;
};

type AttachNoteToEventDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    noteId: string;
    noteParentId?: string | null;
};

function formatEventSecondLine(event: AttachableEvent, locale: Locale): string {
    if (!event.starts_at) {
        return '';
    }

    if (event.all_day) {
        const date = parseISO(event.starts_at);
        const dateStr = isValid(date) ? format(date, 'EEE d MMM yyyy', { locale }) : event.starts_at;
        return event.location ? `${dateStr} · ${event.location}` : dateStr;
    }

    const start = parseISO(event.starts_at);
    if (!isValid(start)) {
        return '';
    }

    const dateStr = format(start, 'EEE d MMM', { locale });
    const startTime = format(start, 'HH:mm');

    const end = event.ends_at ? parseISO(event.ends_at) : null;
    const endTime = end && isValid(end) ? format(end, 'HH:mm') : null;

    const timeRange = endTime ? `${startTime} – ${endTime}` : startTime;
    const base = `${dateStr} · ${timeRange}`;

    return event.location ? `${base} · ${event.location}` : base;
}

export function AttachNoteToEventDialog({
    open,
    onOpenChange,
    noteId,
    noteParentId = null,
}: AttachNoteToEventDialogProps) {
    const pageProps = usePage().props as {
        currentWorkspace?: { slug: string };
        workspaceMeetingParentOptions?: NoteLocationOption[];
        locale?: string;
    };

    const { t } = useI18n();
    const workspaceSlug = pageProps.currentWorkspace?.slug ?? '';
    const locale = pageProps.locale === 'nl' ? nl : enUS;
    const parentOptions: NoteLocationOption[] = pageProps.workspaceMeetingParentOptions ?? [];

    const [events, setEvents] = useState<AttachableEvent[]>([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [selectedBlockId, setSelectedBlockId] = useState('');
    const [parentId, setParentId] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [eventPickerOpen, setEventPickerOpen] = useState(false);
    const [eventQuery, setEventQuery] = useState('');

    const fetchEvents = useCallback(() => {
        if (!workspaceSlug) {
            return;
        }

        setEventsLoading(true);
        void fetch(`/w/${workspaceSlug}/attachable-events`, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        })
            .then((r) => r.json())
            .then((data: { events: AttachableEvent[] }) => {
                setEvents(data.events ?? []);
            })
            .catch(() => {})
            .finally(() => setEventsLoading(false));
    }, [workspaceSlug]);

    useEffect(() => {
        if (!open) {
            return;
        }

        setSelectedBlockId('');
        setParentId(noteParentId ?? '');
        setEventQuery('');
        fetchEvents();
    }, [open, noteParentId, fetchEvents]);

    const filteredEvents = useMemo(() => {
        const q = eventQuery.trim().toLowerCase();
        if (!q) {
            return events;
        }

        return events.filter((e) => {
            const haystack = [
                e.title,
                e.location ?? '',
                formatEventSecondLine(e, locale),
            ]
                .join(' ')
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [events, eventQuery, locale]);

    const selectedEvent = useMemo(
        () => events.find((e) => e.block_id === selectedBlockId) ?? null,
        [events, selectedBlockId],
    );

    const canSubmit = Boolean(selectedBlockId) && Boolean(parentId);

    const handleSubmit = () => {
        if (!canSubmit || submitting) {
            return;
        }

        setSubmitting(true);
        router.patch(
            `/notes/${noteId}/attach-to-event`,
            { event_block_id: selectedBlockId, parent_id: parentId },
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
                    <DialogTitle>{t('attach_to_event_dialog.title', 'Attach note to event')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('attach_to_event_dialog.event_label', 'Event')}</Label>
                        <Popover
                            open={eventPickerOpen}
                            onOpenChange={(next) => {
                                setEventPickerOpen(next);
                                if (!next) {
                                    setEventQuery('');
                                }
                            }}
                        >
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={eventPickerOpen}
                                    className="w-full justify-between font-normal"
                                    disabled={eventsLoading}
                                >
                                    <span className="truncate text-left">
                                        {selectedEvent ? (
                                            selectedEvent.title
                                        ) : eventsLoading ? (
                                            <span className="text-muted-foreground">{t('attach_to_event_dialog.loading_events', 'Loading events…')}</span>
                                        ) : (
                                            <span className="text-muted-foreground">{t('attach_to_event_dialog.select_event', 'Select an event…')}</span>
                                        )}
                                    </span>
                                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                                <Command shouldFilter={false}>
                                    <CommandInput
                                        value={eventQuery}
                                        onValueChange={setEventQuery}
                                        placeholder={t('attach_to_event_dialog.search_events', 'Search events…')}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {eventsLoading ? t('attach_to_event_dialog.loading', 'Loading…') : t('attach_to_event_dialog.no_events', 'No events found.')}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {filteredEvents.map((event) => {
                                                const secondLine = formatEventSecondLine(event, locale);
                                                return (
                                                    <CommandItem
                                                        key={event.block_id}
                                                        value={event.block_id}
                                                        onSelect={() => {
                                                            setSelectedBlockId(event.block_id);
                                                            setEventPickerOpen(false);
                                                            setEventQuery('');
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                'mr-2 size-4 shrink-0',
                                                                selectedBlockId === event.block_id
                                                                    ? 'opacity-100'
                                                                    : 'opacity-0',
                                                            )}
                                                        />
                                                        <span className="flex min-w-0 flex-col">
                                                            <span className="truncate">{event.title}</span>
                                                            {secondLine ? (
                                                                <span className="truncate text-xs text-muted-foreground/70">
                                                                    {secondLine}
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                    </CommandItem>
                                                );
                                            })}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">{t('attach_to_event_dialog.attach_under_label', 'Attach under')}</Label>
                        <NoteLocationCombobox
                            options={parentOptions}
                            value={parentId}
                            onChange={setParentId}
                            placeholder={t('attach_to_event_dialog.select_parent', 'Select a parent note…')}
                            searchPlaceholder={t('attach_to_event_dialog.search_parent', 'Search parent notes…')}
                            emptyText={t('attach_to_event_dialog.no_parent_results', 'No notes found.')}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={submitting}
                    >
                        {t('attach_to_event_dialog.cancel', 'Cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
                        {t('attach_to_event_dialog.submit', 'Attach to event')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
