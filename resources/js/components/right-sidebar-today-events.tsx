import { Link, router, usePage } from '@inertiajs/react';
import { format, isValid, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import {
    Check,
    FileText,
    MoreHorizontal,
    RotateCw,
    Unlink,
    Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { toast } from 'sonner';
import { AttachMeetingNoteDialog } from '@/components/attach-meeting-note-dialog';
import {
    COLOR_SWATCH_THEME_BG_CLASS,
    COLOR_SWATCH_THEME_BORDER_CLASS,
    COLOR_SWATCH_TEXT_CLASS,
} from '@/components/color-swatch-picker';
import { CreateMeetingNoteDialog } from '@/components/create-meeting-note-dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/lib/i18n';
import {
    formatClockTime,
    formatClockTimeInTimeZone,
    formatLongDate,
    resolveLongDateFormat,
    resolveTimeFormat,
} from '@/lib/user-date-time-format';
import { cn } from '@/lib/utils';

type SidebarTodayEvent = {
    id: string;
    block_id: string | null;
    type: 'timeblock' | 'event' | 'birthday';
    all_day: boolean;
    title: string;
    note_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    timezone?: string | null;
    location: string | null;
    task_block_id: string | null;
    task_checked: boolean | null;
    task_status: string | null;
    note_title: string | null;
    href: string | null;
    meeting_note_id: string | null;
    meeting_note_href: string | null;
    remote_deleted?: boolean;
    birthday_age?: number | null;
    calendar_color?: string | null;
};

type RightSidebarTodayEventsProps = {
    events: SidebarTodayEvent[];
    language: 'nl' | 'en';
    anchorDate?: string | null;
    timeblockColor?: string | null;
    workspaceColor?: string | null;
    dateLongFormat?: string | null;
    timeFormat?: string | null;
    timezone?: string | null;
    onRefresh?: () => void;
    isRefreshing?: boolean;
    className?: string;
};

function formatTimeRange(
    startsAt: string | null,
    endsAt: string | null,
    preferredTimeFormat: '24h' | '12h',
    language: 'nl' | 'en',
    timezone?: string | null,
): string {
    if (!startsAt || !endsAt) {
        return '--:--';
    }

    const start = parseISO(startsAt);
    const end = parseISO(endsAt);

    if (!isValid(start) || !isValid(end)) {
        return '--:--';
    }

    if (timezone) {
        return `${formatClockTimeInTimeZone(start, preferredTimeFormat, timezone, language)}-${formatClockTimeInTimeZone(end, preferredTimeFormat, timezone, language)}`;
    }

    return `${formatClockTime(start, preferredTimeFormat)}-${formatClockTime(end, preferredTimeFormat)}`;
}

function formatDurationLabel(
    startsAt: string | null,
    endsAt: string | null,
    language: 'nl' | 'en',
): string | null {
    if (!startsAt || !endsAt) {
        return null;
    }

    const start = parseISO(startsAt);
    const end = parseISO(endsAt);

    if (!isValid(start) || !isValid(end)) {
        return null;
    }

    const durationMs = end.getTime() - start.getTime();
    if (durationMs <= 0) {
        return null;
    }

    const minutes = Math.round(durationMs / 60000);

    if (minutes % 60 === 0) {
        const hours = minutes / 60;
        if (language === 'nl') {
            return `${hours} uur`;
        }

        return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }

    if (language === 'nl') {
        return `${minutes} minuten`;
    }

    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

function formatGapLabel(
    previousEndsAt: string | null,
    nextStartsAt: string | null,
    language: 'nl' | 'en',
): string | null {
    if (!previousEndsAt || !nextStartsAt) {
        return null;
    }

    const previousEnd = parseISO(previousEndsAt);
    const nextStart = parseISO(nextStartsAt);

    if (!isValid(previousEnd) || !isValid(nextStart)) {
        return null;
    }

    const gapMinutes = Math.round(
        (nextStart.getTime() - previousEnd.getTime()) / 60000,
    );
    if (gapMinutes <= 0) {
        return null;
    }

    const hours = Math.floor(gapMinutes / 60);
    const minutes = gapMinutes % 60;

    // Base label (total gap)
    let baseLabel: string;

    if (language === 'nl') {
        if (hours > 0 && minutes > 0) {
            baseLabel = `${hours} uur ${minutes} min`;
        } else if (hours > 0) {
            baseLabel = `${hours} uur`;
        } else {
            baseLabel = `${minutes} min`;
        }
    } else {
        if (hours > 0 && minutes > 0) {
            baseLabel = `${hours}h ${minutes}m`;
        } else if (hours > 0) {
            baseLabel = `${hours}h`;
        } else {
            baseLabel = `${minutes}m`;
        }
    }

    // Determine "now" internally
    const now = new Date();

    const nowMs = now.getTime();
    const startMs = previousEnd.getTime();
    const endMs = nextStart.getTime();

    // If we are inside the gap → show remaining time
    if (nowMs >= startMs && nowMs < endMs) {
        const remainingMinutes = Math.ceil((endMs - nowMs) / 60000);

        if (remainingMinutes > 0) {
            if (language === 'nl') {
                return `${baseLabel} (nog ${remainingMinutes} min)`;
            }

            return `${baseLabel} (${remainingMinutes} remaining)`;
        }
    }

    return baseLabel;
}

function formatStartsSoonLabel(
    startsAt: string | null,
    language: 'nl' | 'en',
    now: Date,
): string | null {
    if (!startsAt) {
        return null;
    }

    const start = parseISO(startsAt);
    if (!isValid(start)) {
        return null;
    }

    const diffMinutes = Math.ceil((start.getTime() - now.getTime()) / 60000);
    if (diffMinutes <= 0 || diffMinutes > 15) {
        return null;
    }

    if (language === 'nl') {
        return `over ${diffMinutes} min`;
    }

    return `in ${diffMinutes} min`;
}

function resolveTimingState(
    startsAt: string | null,
    endsAt: string | null,
    now: Date,
): {
    isActiveNow: boolean;
    hasPassed: boolean;
} {
    if (!startsAt || !endsAt) {
        return { isActiveNow: false, hasPassed: false };
    }

    const start = parseISO(startsAt);
    const end = parseISO(endsAt);

    if (!isValid(start) || !isValid(end)) {
        return { isActiveNow: false, hasPassed: false };
    }

    const nowMs = now.getTime();
    const startMs = start.getTime();
    const endMs = end.getTime();

    return {
        isActiveNow: nowMs >= startMs && nowMs < endMs,
        hasPassed: nowMs >= endMs,
    };
}

function formatAllDayLabel(
    event: SidebarTodayEvent,
    startsAt: string | null,
    endsAt: string | null,
    anchorDate: Date,
    locale: Locale,
    language: 'nl' | 'en',
): string {
    if (event.type === 'birthday') {
        const baseLabel = language === 'nl' ? 'Verjaardag' : 'Birthday';
        const age = event.birthday_age;

        if (typeof age === 'number' && Number.isFinite(age) && age > 0) {
            return `${baseLabel} (${age})`;
        }

        return baseLabel;
    }

    if (!startsAt) {
        return language === 'nl' ? 'Hele dag' : 'All day';
    }

    const start = parseISO(startsAt);
    if (!isValid(start)) {
        return language === 'nl' ? 'Hele dag' : 'All day';
    }

    const end = endsAt ? parseISO(endsAt) : null;
    const isSingleDay = !end || isValid(end) === false || startsAt === endsAt;

    if (isSingleDay) {
        return language === 'nl' ? 'Hele dag' : 'All day';
    }

    const startStr = format(start, 'd MMM', { locale });
    const endStr = format(end!, 'd MMM', { locale });
    const anchorStr = format(anchorDate, 'yyyy-MM-dd');
    const startDateStr = format(start, 'yyyy-MM-dd');
    const endDateStr = format(end!, 'yyyy-MM-dd');

    if (startDateStr === anchorStr && endDateStr === anchorStr) {
        return language === 'nl' ? 'Hele dag' : 'All day';
    }

    return `${startStr} – ${endStr}`;
}

function resolveAccentClassAndStyle(
    calendarColor: string | null | undefined,
    fallbackClass: string,
): { className: string; style?: CSSProperties } {
    const rawColor = (calendarColor ?? '').trim();
    if (rawColor === '') {
        return { className: fallbackClass };
    }

    const normalized = rawColor.toLowerCase();
    const themeClass = (COLOR_SWATCH_THEME_BG_CLASS as Record<string, string>)[
        normalized
    ];
    if (themeClass) {
        return { className: themeClass };
    }

    if (
        /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(rawColor) ||
        /^rgba?\(/i.test(rawColor) ||
        /^hsla?\(/i.test(rawColor)
    ) {
        return {
            className: '',
            style: { backgroundColor: rawColor },
        };
    }

    return { className: fallbackClass };
}

export function RightSidebarTodayEvents({
    events,
    language,
    anchorDate = null,
    timeblockColor = null,
    workspaceColor = null,
    dateLongFormat = null,
    timeFormat = null,
    timezone = null,
    onRefresh,
    isRefreshing = false,
    className,
}: RightSidebarTodayEventsProps) {
    const pageProps = usePage().props as {
        noteActions?: {
            id?: string | null;
            title?: string | null;
            type?: string | null;
            canAttachToEvent?: boolean;
        };
    };
    const { t } = useI18n();
    const isOnMeetingNote = pageProps.noteActions?.type === 'meeting';
    const currentNoteId = pageProps.noteActions?.id ?? null;
    const canAttachCurrentNote = Boolean(
        pageProps.noteActions?.canAttachToEvent,
    );

    const capitalizeFirst = (value: string): string =>
        value.length > 0
            ? value.charAt(0).toUpperCase() + value.slice(1)
            : value;

    const locale = language === 'en' ? enUS : nl;
    const preferredLongDateFormat = resolveLongDateFormat(
        dateLongFormat,
        language,
    );
    const preferredTimeFormat = resolveTimeFormat(timeFormat, language);
    const parsedAnchorDate =
        anchorDate && isValid(parseISO(anchorDate))
            ? parseISO(anchorDate)
            : new Date();
    const headerLabel = capitalizeFirst(
        formatLongDate(parsedAnchorDate, locale, preferredLongDateFormat),
    );
    const allDayEvents = events.filter((e) => e.all_day);
    const timedEvents = events.filter((e) => !e.all_day);
    const [eventItems, setEventItems] =
        useState<SidebarTodayEvent[]>(timedEvents);
    const [pendingTaskBlockIds, setPendingTaskBlockIds] = useState<string[]>(
        [],
    );
    const [now, setNow] = useState<Date>(() => new Date());
    const [meetingDialogOpen, setMeetingDialogOpen] = useState(false);
    const [meetingDialogTitle, setMeetingDialogTitle] = useState('');
    const [meetingDialogEventId, setMeetingDialogEventId] = useState<
        string | undefined
    >(undefined);
    const [attachDialogOpen, setAttachDialogOpen] = useState(false);
    const [attachDialogEventBlockId, setAttachDialogEventBlockId] =
        useState('');
    const [attachDialogEventTitle, setAttachDialogEventTitle] = useState('');
    const [attachDialogNoteId, setAttachDialogNoteId] = useState<string | null>(
        null,
    );
    const [attachDialogNoteTitle, setAttachDialogNoteTitle] = useState<
        string | null
    >(null);
    const [detachingNoteId, setDetachingNoteId] = useState<string | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEventItems(events.filter((e) => !e.all_day));
    }, [events]);
    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setNow(new Date());
        }, 60_000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, []);
    const emptyLabel =
        language === 'en'
            ? 'No events planned for this day.'
            : 'Geen events gepland voor deze dag.';
    const normalizedTimeblockColor = (
        timeblockColor ??
        workspaceColor ??
        'sky'
    ).toLowerCase();
    const normalizedWorkspaceColor = (workspaceColor ?? 'slate').toLowerCase();
    const timeblockAccent =
        (COLOR_SWATCH_THEME_BG_CLASS as Record<string, string>)[
            normalizedTimeblockColor
        ] ?? COLOR_SWATCH_THEME_BG_CLASS.sky;
    const workspaceAccent =
        (COLOR_SWATCH_THEME_BG_CLASS as Record<string, string>)[
            normalizedWorkspaceColor
        ] ?? COLOR_SWATCH_THEME_BG_CLASS.slate;
    const timeblockBorder =
        (COLOR_SWATCH_THEME_BORDER_CLASS as Record<string, string>)[
            normalizedTimeblockColor
        ] ?? COLOR_SWATCH_THEME_BORDER_CLASS.sky;
    const workspaceBorder =
        (COLOR_SWATCH_THEME_BORDER_CLASS as Record<string, string>)[
            normalizedWorkspaceColor
        ] ?? COLOR_SWATCH_THEME_BORDER_CLASS.slate;
    const workspaceText =
        (COLOR_SWATCH_TEXT_CLASS as Record<string, string>)[
            normalizedWorkspaceColor
        ] ?? COLOR_SWATCH_TEXT_CLASS.slate;
    const neutralCardClass = 'bg-zinc-100 dark:bg-zinc-900';

    return (
        <section
            className={cn(
                'mt-2 flex min-h-0 flex-1 flex-col border-t border-sidebar-border/60 px-2 pt-2 pb-2',
                className,
            )}
        >
            <header className="mb-2 flex items-center justify-between px-1 pt-1.5 pb-1.5">
                <h3 className="text-[0.82rem] font-medium text-zinc-600 dark:text-zinc-400">
                    {headerLabel}
                </h3>
                {onRefresh ? (
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={isRefreshing}
                        aria-label={
                            language === 'en'
                                ? 'Refresh events'
                                : 'Ververs events'
                        }
                        className="text-muted-foreground/60 hover:text-muted-foreground disabled:opacity-40"
                    >
                        <RotateCw
                            className={cn(
                                'size-3.5',
                                isRefreshing && 'animate-spin',
                            )}
                        />
                    </button>
                ) : null}
            </header>

            <CreateMeetingNoteDialog
                open={meetingDialogOpen}
                onOpenChange={setMeetingDialogOpen}
                defaultTitle={meetingDialogTitle}
                eventId={meetingDialogEventId}
            />

            <AttachMeetingNoteDialog
                open={attachDialogOpen}
                onOpenChange={setAttachDialogOpen}
                eventBlockId={attachDialogEventBlockId}
                eventTitle={attachDialogEventTitle}
                noteId={attachDialogNoteId}
                noteTitle={attachDialogNoteTitle}
            />

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                {allDayEvents.length > 0 ? (
                    <ul className="mb-2 space-y-0.5">
                        {allDayEvents.map((event) => {
                            const eventAccent =
                                event.type === 'timeblock'
                                    ? { className: timeblockAccent }
                                    : resolveAccentClassAndStyle(
                                          event.calendar_color,
                                          workspaceAccent,
                                      );
                            const dateLabel = formatAllDayLabel(
                                event,
                                event.starts_at,
                                event.ends_at,
                                parsedAnchorDate,
                                locale,
                                language,
                            );
                            const eventIdentifier = event.block_id ?? event.id;

                            return (
                                <li key={event.id}>
                                    <div className="group/item flex items-center gap-2 rounded-md px-1 py-1">
                                        <span
                                            className={cn(
                                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                                eventAccent.className,
                                            )}
                                            style={eventAccent.style}
                                            aria-hidden="true"
                                        />
                                        {event.meeting_note_href ? (
                                            <Link
                                                href={event.meeting_note_href}
                                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                                aria-label="Open meeting note"
                                            >
                                                <FileText className="size-3" />
                                            </Link>
                                        ) : null}
                                        <p
                                            className={cn(
                                                'line-clamp-2 min-w-0 flex-1 text-[0.82rem] text-foreground/80',
                                                event.remote_deleted &&
                                                    'line-through opacity-60',
                                            )}
                                        >
                                            {event.title}
                                        </p>
                                        {event.remote_deleted && (
                                            <span className="shrink-0 rounded bg-destructive/10 px-1 py-px text-[0.62rem] font-medium tracking-wide text-destructive uppercase">
                                                Deleted
                                            </span>
                                        )}
                                        <span className="shrink-0 text-[0.72rem] text-muted-foreground">
                                            {dateLabel}
                                        </span>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button
                                                    type="button"
                                                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/item:opacity-100 hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                                                    aria-label="Event options"
                                                >
                                                    <MoreHorizontal className="size-3.5" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent
                                                align="end"
                                                className="w-52"
                                            >
                                                {event.meeting_note_href ? (
                                                    <>
                                                        <DropdownMenuItem
                                                            asChild
                                                        >
                                                            <Link
                                                                href={
                                                                    event.meeting_note_href
                                                                }
                                                            >
                                                                <FileText className="mr-2 size-3.5" />
                                                                {t(
                                                                    'sidebar_events.view_meeting_note',
                                                                    'View meeting note',
                                                                )}
                                                            </Link>
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onSelect={() => {
                                                                if (
                                                                    !event.meeting_note_id
                                                                )
                                                                    return;
                                                                setDetachingNoteId(
                                                                    event.meeting_note_id,
                                                                );
                                                                router.patch(
                                                                    `/notes/${event.meeting_note_id}/detach-from-event`,
                                                                    {},
                                                                    {
                                                                        preserveState: false,
                                                                        preserveScroll: true,
                                                                        onFinish:
                                                                            () =>
                                                                                setDetachingNoteId(
                                                                                    null,
                                                                                ),
                                                                    },
                                                                );
                                                            }}
                                                            disabled={
                                                                detachingNoteId ===
                                                                event.meeting_note_id
                                                            }
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Unlink className="mr-2 size-3.5" />
                                                            {t(
                                                                'sidebar_events.detach_meeting_note',
                                                                'Detach meeting note',
                                                            )}
                                                        </DropdownMenuItem>
                                                    </>
                                                ) : (
                                                    <>
                                                        <DropdownMenuItem
                                                            onSelect={() => {
                                                                setMeetingDialogTitle(
                                                                    event.title,
                                                                );
                                                                setMeetingDialogEventId(
                                                                    eventIdentifier ??
                                                                        undefined,
                                                                );
                                                                setMeetingDialogOpen(
                                                                    true,
                                                                );
                                                            }}
                                                        >
                                                            <Users className="mr-2 size-3.5" />
                                                            {t(
                                                                'sidebar_events.create_meeting_note',
                                                                'Create meeting note',
                                                            )}
                                                        </DropdownMenuItem>
                                                        {canAttachCurrentNote &&
                                                        currentNoteId ? (
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    setAttachDialogEventBlockId(
                                                                        eventIdentifier ??
                                                                            '',
                                                                    );
                                                                    setAttachDialogEventTitle(
                                                                        event.title,
                                                                    );
                                                                    setAttachDialogNoteId(
                                                                        currentNoteId,
                                                                    );
                                                                    setAttachDialogNoteTitle(
                                                                        pageProps
                                                                            .noteActions
                                                                            ?.title ??
                                                                            null,
                                                                    );
                                                                    setAttachDialogOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                                disabled={
                                                                    !eventIdentifier
                                                                }
                                                            >
                                                                <FileText className="mr-2 size-3.5" />
                                                                {t(
                                                                    'sidebar_events.attach_current_note',
                                                                    'Attach current note',
                                                                )}
                                                            </DropdownMenuItem>
                                                        ) : !isOnMeetingNote ? (
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    setAttachDialogEventBlockId(
                                                                        eventIdentifier ??
                                                                            '',
                                                                    );
                                                                    setAttachDialogEventTitle(
                                                                        event.title,
                                                                    );
                                                                    setAttachDialogNoteId(
                                                                        null,
                                                                    );
                                                                    setAttachDialogNoteTitle(
                                                                        null,
                                                                    );
                                                                    setAttachDialogOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                                disabled={
                                                                    !eventIdentifier
                                                                }
                                                            >
                                                                <FileText className="mr-2 size-3.5" />
                                                                {t(
                                                                    'sidebar_events.link_existing_note',
                                                                    'Link existing note',
                                                                )}
                                                            </DropdownMenuItem>
                                                        ) : null}
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : null}

                {timedEvents.length === 0 && allDayEvents.length === 0 ? (
                    <p className="px-1 py-2 text-sm text-muted-foreground/90">
                        {emptyLabel}
                    </p>
                ) : timedEvents.length > 0 ? (
                    <ul className="space-y-1.5">
                        {eventItems.map((event, index) => {
                            const linkedBlockId =
                                typeof event.task_block_id === 'string' &&
                                event.task_block_id !== ''
                                    ? event.task_block_id
                                    : null;
                            const isTaskTogglePending =
                                linkedBlockId !== null &&
                                pendingTaskBlockIds.includes(linkedBlockId);
                            const toggleLinkedTask = () => {
                                if (
                                    !linkedBlockId ||
                                    !event.note_id ||
                                    isTaskTogglePending ||
                                    event.task_status === 'migrated'
                                ) {
                                    return;
                                }

                                const isBacklogPromotion =
                                    event.task_status === 'backlog' &&
                                    event.task_checked !== true;
                                const nextChecked = isBacklogPromotion
                                    ? false
                                    : !event.task_checked;

                                setPendingTaskBlockIds((current) => [
                                    ...current,
                                    linkedBlockId,
                                ]);
                                router.patch(
                                    '/tasks/checked',
                                    {
                                        note_id: event.note_id,
                                        block_id: linkedBlockId,
                                        checked: nextChecked,
                                        promote_backlog: isBacklogPromotion,
                                    },
                                    {
                                        preserveState: true,
                                        preserveScroll: true,
                                        replace: true,
                                        onSuccess: () => {
                                            setEventItems((current) =>
                                                current.map((item) =>
                                                    item.id === event.id
                                                        ? {
                                                              ...item,
                                                              task_checked:
                                                                  nextChecked,
                                                              task_status:
                                                                  isBacklogPromotion
                                                                      ? null
                                                                      : item.task_status,
                                                          }
                                                        : item,
                                                ),
                                            );
                                        },
                                        onError: () => {
                                            toast.error(
                                                language === 'en'
                                                    ? 'Failed to update task status.'
                                                    : 'Bijwerken van taakstatus mislukt.',
                                            );
                                        },
                                        onFinish: () => {
                                            setPendingTaskBlockIds((current) =>
                                                current.filter(
                                                    (blockId) =>
                                                        blockId !==
                                                        linkedBlockId,
                                                ),
                                            );
                                        },
                                    },
                                );
                            };

                            const timeRange = formatTimeRange(
                                event.starts_at,
                                event.ends_at,
                                preferredTimeFormat,
                                language,
                                timezone ?? event.timezone ?? null,
                            );
                            const isTimeblock = event.type === 'timeblock';
                            const hasLinkedTask =
                                isTimeblock && !!event.task_block_id;
                            const isLinkedTaskCompleted =
                                hasLinkedTask && Boolean(event.task_checked);
                            const { isActiveNow, hasPassed } =
                                resolveTimingState(
                                    event.starts_at,
                                    event.ends_at,
                                    now,
                                );
                            const shouldDim =
                                (isTimeblock && !hasLinkedTask && hasPassed) ||
                                isLinkedTaskCompleted;
                            const eventAccent = isTimeblock
                                ? { className: timeblockAccent }
                                : resolveAccentClassAndStyle(
                                      event.calendar_color,
                                      workspaceAccent,
                                  );
                            const checkboxBorderClass = isTimeblock
                                ? timeblockBorder
                                : workspaceBorder;
                            const checkboxAccentClass = isTimeblock
                                ? timeblockAccent
                                : workspaceAccent;
                            const durationLabel = formatDurationLabel(
                                event.starts_at,
                                event.ends_at,
                                language,
                            );
                            const startsSoonLabel = formatStartsSoonLabel(
                                event.starts_at,
                                language,
                                now,
                            );
                            const nextTimedEvent =
                                eventItems[index + 1] ?? null;
                            const gapLabel = nextTimedEvent
                                ? formatGapLabel(
                                      event.ends_at,
                                      nextTimedEvent.starts_at,
                                      language,
                                  )
                                : null;

                            const eventIdentifier = event.block_id ?? event.id;

                            return [
                                <li key={event.id}>
                                    <article
                                        className={cn(
                                            'group relative rounded-lg px-3 py-2.5 shadow-sm transition-opacity',
                                            neutralCardClass,
                                            !isTimeblock &&
                                                'border border-sidebar-border/60',
                                            shouldDim && 'opacity-60',
                                            event.remote_deleted &&
                                                'opacity-50',
                                            isTimeblock &&
                                                isActiveNow &&
                                                cn('border-2', timeblockBorder),
                                        )}
                                    >
                                        {/* options dropdown */}
                                        <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                                                        aria-label="Event options"
                                                    >
                                                        <MoreHorizontal className="size-3.5" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent
                                                    align="end"
                                                    className="w-52"
                                                >
                                                    {event.meeting_note_href ? (
                                                        <>
                                                            <DropdownMenuItem
                                                                asChild
                                                            >
                                                                <Link
                                                                    href={
                                                                        event.meeting_note_href
                                                                    }
                                                                >
                                                                    <FileText className="mr-2 size-3.5" />
                                                                    View meeting
                                                                    note
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    if (
                                                                        !event.meeting_note_id
                                                                    )
                                                                        return;
                                                                    setDetachingNoteId(
                                                                        event.meeting_note_id,
                                                                    );
                                                                    router.patch(
                                                                        `/notes/${event.meeting_note_id}/detach-from-event`,
                                                                        {},
                                                                        {
                                                                            preserveState: false,
                                                                            preserveScroll: true,
                                                                            onFinish:
                                                                                () =>
                                                                                    setDetachingNoteId(
                                                                                        null,
                                                                                    ),
                                                                        },
                                                                    );
                                                                }}
                                                                disabled={
                                                                    detachingNoteId ===
                                                                    event.meeting_note_id
                                                                }
                                                                className="text-destructive focus:text-destructive"
                                                            >
                                                                <Unlink className="mr-2 size-3.5" />
                                                                Detach meeting
                                                                note
                                                            </DropdownMenuItem>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <DropdownMenuItem
                                                                onSelect={() => {
                                                                    setMeetingDialogTitle(
                                                                        event.title,
                                                                    );
                                                                    setMeetingDialogEventId(
                                                                        eventIdentifier ??
                                                                            undefined,
                                                                    );
                                                                    setMeetingDialogOpen(
                                                                        true,
                                                                    );
                                                                }}
                                                            >
                                                                <Users className="mr-2 size-3.5" />
                                                                Create meeting
                                                                note
                                                            </DropdownMenuItem>
                                                            {canAttachCurrentNote &&
                                                            currentNoteId ? (
                                                                <DropdownMenuItem
                                                                    onSelect={() => {
                                                                        setAttachDialogEventBlockId(
                                                                            eventIdentifier ??
                                                                                '',
                                                                        );
                                                                        setAttachDialogEventTitle(
                                                                            event.title,
                                                                        );
                                                                        setAttachDialogNoteId(
                                                                            currentNoteId,
                                                                        );
                                                                        setAttachDialogNoteTitle(
                                                                            pageProps
                                                                                .noteActions
                                                                                ?.title ??
                                                                                null,
                                                                        );
                                                                        setAttachDialogOpen(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    disabled={
                                                                        !eventIdentifier
                                                                    }
                                                                >
                                                                    <FileText className="mr-2 size-3.5" />
                                                                    Attach
                                                                    current note
                                                                </DropdownMenuItem>
                                                            ) : !isOnMeetingNote ? (
                                                                <DropdownMenuItem
                                                                    onSelect={() => {
                                                                        setAttachDialogEventBlockId(
                                                                            eventIdentifier ??
                                                                                '',
                                                                        );
                                                                        setAttachDialogEventTitle(
                                                                            event.title,
                                                                        );
                                                                        setAttachDialogNoteId(
                                                                            null,
                                                                        );
                                                                        setAttachDialogNoteTitle(
                                                                            null,
                                                                        );
                                                                        setAttachDialogOpen(
                                                                            true,
                                                                        );
                                                                    }}
                                                                    disabled={
                                                                        !eventIdentifier
                                                                    }
                                                                >
                                                                    <FileText className="mr-2 size-3.5" />
                                                                    Link
                                                                    existing
                                                                    note
                                                                </DropdownMenuItem>
                                                            ) : null}
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>

                                        <div className="flex items-start gap-2.5">
                                            {/* left accent: task checkbox or colored bar */}
                                            {hasLinkedTask ? (
                                                <button
                                                    type="button"
                                                    onClick={toggleLinkedTask}
                                                    disabled={
                                                        isTaskTogglePending ||
                                                        event.task_status ===
                                                            'migrated'
                                                    }
                                                    aria-label={
                                                        language === 'en'
                                                            ? 'Toggle linked task'
                                                            : 'Gekoppelde taak wisselen'
                                                    }
                                                    className={cn(
                                                        'mt-[0.2rem] inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-opacity',
                                                        isTaskTogglePending &&
                                                            'opacity-60',
                                                        isLinkedTaskCompleted
                                                            ? cn(
                                                                  checkboxBorderClass,
                                                                  checkboxAccentClass,
                                                                  'text-white dark:text-black',
                                                              )
                                                            : cn(
                                                                  checkboxBorderClass,
                                                                  'bg-transparent text-transparent',
                                                              ),
                                                    )}
                                                >
                                                    <Check className="h-3.5 w-3.5 stroke-4" />
                                                </button>
                                            ) : (
                                                <span
                                                    className={cn(
                                                        'mt-[0.2rem] w-1 shrink-0 self-stretch rounded-full',
                                                        eventAccent.className,
                                                    )}
                                                    style={eventAccent.style}
                                                    aria-hidden="true"
                                                />
                                            )}

                                            {/* content */}
                                            <div className="min-w-0 flex-1 pr-4">
                                                {/* time row */}
                                                <p
                                                    className={cn(
                                                        'mb-0.5 truncate text-[0.72rem] leading-none',
                                                        isActiveNow
                                                            ? cn(
                                                                  'font-semibold',
                                                                  workspaceText,
                                                              )
                                                            : 'text-muted-foreground',
                                                    )}
                                                >
                                                    {timeRange}
                                                    {durationLabel ? (
                                                        <span className="opacity-70">
                                                            {' '}
                                                            · {durationLabel}
                                                        </span>
                                                    ) : null}
                                                    {isActiveNow ? (
                                                        <span className="ml-1.5">
                                                            {language === 'nl'
                                                                ? '· Nu bezig'
                                                                : '· Now'}
                                                        </span>
                                                    ) : startsSoonLabel ? (
                                                        <span
                                                            className={cn(
                                                                'ml-1.5',
                                                                workspaceText,
                                                            )}
                                                        >
                                                            {' '}
                                                            · {startsSoonLabel}
                                                        </span>
                                                    ) : null}
                                                </p>

                                                {/* title row */}
                                                <div className="flex items-center gap-1.5">
                                                    {event.meeting_note_href ? (
                                                        <Link
                                                            href={
                                                                event.meeting_note_href
                                                            }
                                                            className="shrink-0 text-muted-foreground hover:text-foreground"
                                                            aria-label="Open meeting note"
                                                        >
                                                            <FileText className="size-3" />
                                                        </Link>
                                                    ) : null}
                                                    <p
                                                        className={cn(
                                                            'line-clamp-2 text-[0.86rem] leading-snug font-medium text-foreground',
                                                            isLinkedTaskCompleted &&
                                                                'line-through',
                                                            event.remote_deleted &&
                                                                'text-muted-foreground line-through',
                                                        )}
                                                    >
                                                        {event.title}
                                                    </p>
                                                    {event.remote_deleted && (
                                                        <span className="shrink-0 rounded bg-destructive/10 px-1 py-px text-[0.62rem] font-medium tracking-wide text-destructive uppercase">
                                                            Deleted
                                                        </span>
                                                    )}
                                                </div>

                                                {/* location */}
                                                {event.location ? (
                                                    <p className="mt-0.5 truncate text-[0.72rem] text-muted-foreground italic">
                                                        {event.location}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </div>
                                    </article>
                                </li>,
                                gapLabel ? (
                                    <li
                                        key={`${event.id}-gap`}
                                        className="px-1 py-0.5 text-center text-[0.74rem] text-muted-foreground/80"
                                    >
                                        {gapLabel}
                                    </li>
                                ) : null,
                            ];
                        })}
                    </ul>
                ) : null}
            </div>
        </section>
    );
}
