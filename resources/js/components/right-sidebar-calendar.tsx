import { router, usePage } from '@inertiajs/react';
import {
    addMonths,
    endOfMonth,
    endOfWeek,
    format,
    getISOWeek,
    getISOWeekYear,
    parseISO,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MeetingNotesSidebar } from '@/components/meeting-notes-sidebar';
import type { MeetingNote } from '@/components/meeting-notes-sidebar';
import { RightSidebarTodayEvents } from '@/components/right-sidebar-today-events';
import { Button } from '@/components/ui/button';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { PREFETCH_CACHE_FOR_MS, PREFETCH_HOVER_DELAY_MS } from '@/lib/prefetch';
import { cn } from '@/lib/utils';

type SidebarEvent = {
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
    birthday_age?: number | null;
    calendar_color?: string | null;
};

type JournalPageProps = {
    noteId?: string;
    noteType?: string;
    journalGranularity?: string | null;
    journalPeriod?: string | null;
    meetingChildren?: Array<{
        id: string;
        title: string;
        href: string;
        starts_at?: string | null;
        event_deleted?: boolean;
        task_counts?: {
            total?: number;
            open?: number;
            completed?: number;
            canceled?: number;
            migrated?: number;
            in_progress?: number;
            backlog?: number;
            assigned?: number;
            deferred?: number;
            starred?: number;
        } | null;
    }>;
    auth?: {
        user?: {
            settings?: {
                language?: string;
                date_long_format?: string;
                time_format?: string;
                timezone?: string;
            };
        };
    };
    currentWorkspace?: {
        slug?: string | null;
        color?: string | null;
        timeblock_color?: string | null;
    };
    personalWorkspace?: {
        slug?: string | null;
    } | null;
};

type DayIndicatorTaskState = 'none' | 'all_completed' | 'open' | 'open_past';

type DayIndicator = {
    has_note: boolean;
    has_events: boolean;
    task_state: DayIndicatorTaskState;
    events_count: number;
    birthday_count: number;
    open_tasks_count: number;
};

type WeekIndicator = {
    has_note: boolean;
    has_events: boolean;
    task_state: DayIndicatorTaskState;
    events_count: number;
    birthday_count: number;
    open_note_tasks_count: number;
    assigned_tasks_count: number;
};

type PeriodIndicator = WeekIndicator;

type IndicatorResponse = {
    days?: Record<string, DayIndicator>;
    weeks?: Record<string, WeekIndicator>;
    months?: Record<string, PeriodIndicator>;
    years?: Record<string, PeriodIndicator>;
    pending_dates?: string[];
    version?: string;
    polling_ms?: number;
};

type CachedIndicatorPayload = {
    days: Record<string, DayIndicator>;
    weeks: Record<string, WeekIndicator>;
    months: Record<string, PeriodIndicator>;
    years: Record<string, PeriodIndicator>;
    version: string;
    fetchedAt: number;
    pollingMs: number;
};

const INDICATOR_CACHE_STORAGE_KEY = 'sidebar:indicator-cache:v2';
const INDICATOR_CACHE_FRESH_FOR_MS = 5 * 60 * 1000;
const INDICATOR_MIN_POLLING_MS = 5_000;
const INDICATOR_MAX_POLLING_MS = 5 * 60 * 1000;
const INDICATOR_PENDING_BASE_POLLING_MS = 10_000;
const INDICATOR_IDLE_POLLING_MS = 5 * 60 * 1000;
const INDICATOR_ERROR_BASE_POLLING_MS = 30_000;
const indicatorMemoryCache: Record<string, CachedIndicatorPayload> = {};

const CALENDAR_SELECTED_DAY_CLASS: Record<string, string> = {
    black: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-zinc-900/15 dark:data-[selected-single=true]:bg-zinc-100/20 data-[selected-single=true]:text-foreground',
    slate: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-slate-500/20 dark:data-[selected-single=true]:bg-slate-400/25 data-[selected-single=true]:text-foreground',
    zinc: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-zinc-500/20 dark:data-[selected-single=true]:bg-zinc-400/25 data-[selected-single=true]:text-foreground',
    stone: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-stone-500/20 dark:data-[selected-single=true]:bg-stone-400/25 data-[selected-single=true]:text-foreground',
    red: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-red-500/20 dark:data-[selected-single=true]:bg-red-400/25 data-[selected-single=true]:text-foreground',
    orange: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-orange-500/20 dark:data-[selected-single=true]:bg-orange-400/25 data-[selected-single=true]:text-foreground',
    amber: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-amber-500/22 dark:data-[selected-single=true]:bg-amber-400/28 data-[selected-single=true]:text-foreground',
    yellow: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-yellow-400/28 dark:data-[selected-single=true]:bg-yellow-300/30 data-[selected-single=true]:text-foreground',
    lime: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-lime-500/20 dark:data-[selected-single=true]:bg-lime-400/25 data-[selected-single=true]:text-foreground',
    green: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-green-500/20 dark:data-[selected-single=true]:bg-green-400/25 data-[selected-single=true]:text-foreground',
    emerald:
        'rounded-md hover:bg-muted data-[selected-single=true]:bg-emerald-500/20 dark:data-[selected-single=true]:bg-emerald-400/25 data-[selected-single=true]:text-foreground',
    teal: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-teal-500/20 dark:data-[selected-single=true]:bg-teal-400/25 data-[selected-single=true]:text-foreground',
    cyan: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-cyan-500/20 dark:data-[selected-single=true]:bg-cyan-400/25 data-[selected-single=true]:text-foreground',
    sky: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-sky-500/20 dark:data-[selected-single=true]:bg-sky-400/25 data-[selected-single=true]:text-foreground',
    blue: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-blue-500/20 dark:data-[selected-single=true]:bg-blue-400/25 data-[selected-single=true]:text-foreground',
    indigo: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-indigo-500/20 dark:data-[selected-single=true]:bg-indigo-400/25 data-[selected-single=true]:text-foreground',
    violet: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-violet-500/20 dark:data-[selected-single=true]:bg-violet-400/25 data-[selected-single=true]:text-foreground',
    purple: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-purple-500/20 dark:data-[selected-single=true]:bg-purple-400/25 data-[selected-single=true]:text-foreground',
    fuchsia:
        'rounded-md hover:bg-muted data-[selected-single=true]:bg-fuchsia-500/20 dark:data-[selected-single=true]:bg-fuchsia-400/25 data-[selected-single=true]:text-foreground',
    pink: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-pink-500/20 dark:data-[selected-single=true]:bg-pink-400/25 data-[selected-single=true]:text-foreground',
    rose: 'rounded-md hover:bg-muted data-[selected-single=true]:bg-rose-500/20 dark:data-[selected-single=true]:bg-rose-400/25 data-[selected-single=true]:text-foreground',
};

const CALENDAR_SELECTED_WEEK_CLASS: Record<string, string> = {
    black: 'rounded-md bg-zinc-900/15 text-foreground dark:bg-zinc-100/20',
    slate: 'rounded-md bg-slate-500/20 text-foreground dark:bg-slate-400/25',
    zinc: 'rounded-md bg-zinc-500/20 text-foreground dark:bg-zinc-400/25',
    stone: 'rounded-md bg-stone-500/20 text-foreground dark:bg-stone-400/25',
    red: 'rounded-md bg-red-500/20 text-foreground dark:bg-red-400/25',
    orange: 'rounded-md bg-orange-500/20 text-foreground dark:bg-orange-400/25',
    amber: 'rounded-md bg-amber-500/22 text-foreground dark:bg-amber-400/28',
    yellow: 'rounded-md bg-yellow-400/28 text-foreground dark:bg-yellow-300/30',
    lime: 'rounded-md bg-lime-500/20 text-foreground dark:bg-lime-400/25',
    green: 'rounded-md bg-green-500/20 text-foreground dark:bg-green-400/25',
    emerald:
        'rounded-md bg-emerald-500/20 text-foreground dark:bg-emerald-400/25',
    teal: 'rounded-md bg-teal-500/20 text-foreground dark:bg-teal-400/25',
    cyan: 'rounded-md bg-cyan-500/20 text-foreground dark:bg-cyan-400/25',
    sky: 'rounded-md bg-sky-500/20 text-foreground dark:bg-sky-400/25',
    blue: 'rounded-md bg-blue-500/20 text-foreground dark:bg-blue-400/25',
    indigo: 'rounded-md bg-indigo-500/20 text-foreground dark:bg-indigo-400/25',
    violet: 'rounded-md bg-violet-500/20 text-foreground dark:bg-violet-400/25',
    purple: 'rounded-md bg-purple-500/20 text-foreground dark:bg-purple-400/25',
    fuchsia:
        'rounded-md bg-fuchsia-500/20 text-foreground dark:bg-fuchsia-400/25',
    pink: 'rounded-md bg-pink-500/20 text-foreground dark:bg-pink-400/25',
    rose: 'rounded-md bg-rose-500/20 text-foreground dark:bg-rose-400/25',
};

function parseJournalPeriod(
    granularity: string | null | undefined,
    period: string | null | undefined,
): Date | null {
    if (!granularity || !period) {
        return null;
    }

    if (granularity === 'daily') {
        const match = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return parseISO(period);
        }

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);

        return new Date(year, month - 1, day);
    }

    if (granularity === 'weekly') {
        const match = period.match(/^(\d{4})-W(\d{2})$/);
        if (!match) {
            return null;
        }

        const isoYear = Number(match[1]);
        const isoWeek = Number(match[2]);
        if (Number.isNaN(isoYear) || Number.isNaN(isoWeek)) {
            return null;
        }

        // ISO week anchor: Monday of the requested ISO week.
        const jan4 = new Date(Date.UTC(isoYear, 0, 4));
        const jan4Day = jan4.getUTCDay() || 7; // Mon=1..Sun=7
        const mondayWeek1 = new Date(jan4);
        mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
        mondayWeek1.setUTCDate(mondayWeek1.getUTCDate() + (isoWeek - 1) * 7);

        return new Date(
            mondayWeek1.getUTCFullYear(),
            mondayWeek1.getUTCMonth(),
            mondayWeek1.getUTCDate(),
        );
    }

    if (granularity === 'monthly') {
        return parseISO(`${period}-01`);
    }

    if (granularity === 'yearly') {
        return parseISO(`${period}-01-01`);
    }

    return null;
}

function isValidJournalPeriod(granularity: string, period: string): boolean {
    if (granularity === 'daily') {
        return /^\d{4}-\d{2}-\d{2}$/.test(period);
    }

    if (granularity === 'weekly') {
        return /^\d{4}-W\d{2}$/.test(period);
    }

    if (granularity === 'monthly') {
        return /^\d{4}-\d{2}$/.test(period);
    }

    if (granularity === 'yearly') {
        return /^\d{4}$/.test(period);
    }

    return false;
}

function formatIndicatorTooltip(
    indicator: DayIndicator | undefined,
): string | null {
    if (!indicator) {
        return null;
    }

    const parts: string[] = [];

    if (indicator.events_count > 0) {
        parts.push(
            `${indicator.events_count} ${indicator.events_count === 1 ? 'event' : 'events'}`,
        );
    }

    if (indicator.open_tasks_count > 0) {
        parts.push(
            `${indicator.open_tasks_count} open ${indicator.open_tasks_count === 1 ? 'task' : 'tasks'}`,
        );
    }

    if (indicator.birthday_count > 0) {
        parts.push(
            `${indicator.birthday_count} ${indicator.birthday_count === 1 ? 'birthday' : 'birthdays'}`,
        );
    }

    return parts.length > 0 ? parts.join(', ') : null;
}

function formatWeekIndicatorTooltip(indicator: WeekIndicator | undefined): string | null {
    if (!indicator) {
        return null;
    }

    const parts: string[] = [];

    if (indicator.events_count > 0) {
        parts.push(
            `${indicator.events_count} ${indicator.events_count === 1 ? 'event' : 'events'}`,
        );
    }

    const openTasks = indicator.open_note_tasks_count + indicator.assigned_tasks_count;
    if (openTasks > 0) {
        parts.push(
            `${openTasks} open ${openTasks === 1 ? 'task' : 'tasks'}`,
        );
    }

    if (indicator.birthday_count > 0) {
        parts.push(
            `${indicator.birthday_count} ${indicator.birthday_count === 1 ? 'birthday' : 'birthdays'}`,
        );
    }

    if (indicator.has_note) {
        parts.push('Note exists');
    }

    return parts.length > 0 ? parts.join(', ') : null;
}

export function RightSidebarCalendar() {
    const pageProps = usePage().props as JournalPageProps;
    const prefetchTimeoutRef = useRef<number | null>(null);
    const workspaceSlug = pageProps.currentWorkspace?.slug?.trim() ?? '';
    const personalWorkspaceSlug =
        pageProps.personalWorkspace?.slug?.trim() ?? '';
    const journalView = pageProps.noteType === 'journal';
    const eventsWorkspaceSlug =
        journalView && personalWorkspaceSlug !== ''
            ? personalWorkspaceSlug
            : workspaceSlug;
    const language =
        pageProps.auth?.user?.settings?.language === 'en' ? 'en' : 'nl';
    const workspaceColor = pageProps.currentWorkspace?.color ?? 'slate';
    const selectedDayClass =
        CALENDAR_SELECTED_DAY_CLASS[workspaceColor] ??
        CALENDAR_SELECTED_DAY_CLASS.slate;
    const selectedWeekClass =
        CALENDAR_SELECTED_WEEK_CLASS[workspaceColor] ??
        CALENDAR_SELECTED_WEEK_CLASS.slate;
    const dateLocale = language === 'en' ? enUS : nl;
    const activeDailyDate =
        pageProps.noteType === 'journal' &&
        pageProps.journalGranularity === 'daily' &&
        pageProps.journalPeriod
            ? (parseJournalPeriod('daily', pageProps.journalPeriod) ??
              undefined)
            : undefined;
    const anchorDate = useMemo(
        () =>
            parseJournalPeriod(
                pageProps.journalGranularity,
                pageProps.journalPeriod,
            ),
        [pageProps.journalGranularity, pageProps.journalPeriod],
    );
    const calendarKey = anchorDate
        ? format(anchorDate, 'yyyy-MM-dd')
        : 'default-month';
    const [viewMonth, setViewMonth] = useState<Date>(anchorDate ?? new Date());
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const syncPollRef = useRef<number | null>(null);
    const monthSyncTimerRef = useRef<number | null>(null);
    const monthSyncFollowUpRef = useRef<number | null>(null);
    const [events, setEvents] = useState<SidebarEvent[]>([]);
    const [eventsDate, setEventsDate] = useState<string | null>(null);
    const [dayIndicators, setDayIndicators] = useState<
        Record<string, DayIndicator>
    >({});
    const [weekIndicators, setWeekIndicators] = useState<
        Record<string, WeekIndicator>
    >({});
    const [monthIndicators, setMonthIndicators] = useState<
        Record<string, PeriodIndicator>
    >({});
    const [yearIndicators, setYearIndicators] = useState<
        Record<string, PeriodIndicator>
    >({});
    const indicatorCacheRef = useRef<Record<string, CachedIndicatorPayload>>({
        ...indicatorMemoryCache,
    });
    const indicatorPollRef = useRef<number | null>(null);
    const indicatorStableVersionCountRef = useRef<Record<string, number>>({});
    const indicatorPendingAttemptRef = useRef<Record<string, number>>({});
    const indicatorErrorAttemptRef = useRef<Record<string, number>>({});
    const [indicatorRefreshNonce, setIndicatorRefreshNonce] = useState(0);
    const meetingChildren = useMemo(
        () => pageProps.meetingChildren ?? [],
        [pageProps.meetingChildren],
    );
    const isDailyJournalNote =
        pageProps.noteType === 'journal' &&
        pageProps.journalGranularity === 'daily';
    const dailyMeetingNotes = useMemo<MeetingNote[]>(() => {
        if (!isDailyJournalNote || events.length === 0) {
            return [];
        }

        const byMeetingId = new Map<string, MeetingNote>();

        events.forEach((eventItem) => {
            const meetingId = eventItem.meeting_note_id?.trim() ?? '';
            const meetingHref = eventItem.meeting_note_href?.trim() ?? '';
            const meetingTitle = eventItem.note_title?.trim() ?? '';

            if (meetingId === '' || meetingHref === '' || meetingTitle === '') {
                return;
            }

            const existing = byMeetingId.get(meetingId);
            if (existing) {
                return;
            }

            byMeetingId.set(meetingId, {
                id: meetingId,
                title: meetingTitle,
                href: meetingHref,
                starts_at: eventItem.starts_at,
                event_deleted: eventItem.remote_deleted === true,
                task_counts: null,
            });
        });

        return Array.from(byMeetingId.values());
    }, [events, isDailyJournalNote]);
    const tabMeetingNotes = useMemo<MeetingNote[]>(() => {
        if (pageProps.noteType === 'meeting') {
            return meetingChildren;
        }

        if (isDailyJournalNote) {
            return dailyMeetingNotes;
        }

        return [];
    }, [dailyMeetingNotes, isDailyJournalNote, meetingChildren, pageProps.noteType]);
    const hasMeetingsTab = tabMeetingNotes.length > 0;
    const [activeSidebarTab, setActiveSidebarTab] = useState<
        'events' | 'meetings'
    >(hasMeetingsTab && !isDailyJournalNote ? 'meetings' : 'events');

    useEffect(() => {
        if (hasMeetingsTab && !isDailyJournalNote) {
            setActiveSidebarTab('meetings');
            return;
        }

        setActiveSidebarTab('events');
    }, [hasMeetingsTab, isDailyJournalNote]);

    const readStorageCache = useCallback((): Record<string, CachedIndicatorPayload> => {
        if (typeof window === 'undefined') {
            return {};
        }

        try {
            const raw = window.sessionStorage.getItem(
                INDICATOR_CACHE_STORAGE_KEY,
            );
            if (!raw) {
                return {};
            }

            const parsed = JSON.parse(raw) as unknown;
            if (!parsed || typeof parsed !== 'object') {
                return {};
            }

            return parsed as Record<string, CachedIndicatorPayload>;
        } catch {
            return {};
        }
    }, []);

    const writeStorageCache = useCallback(
        (cache: Record<string, CachedIndicatorPayload>): void => {
            if (typeof window === 'undefined') {
                return;
            }

            try {
                window.sessionStorage.setItem(
                    INDICATOR_CACHE_STORAGE_KEY,
                    JSON.stringify(cache),
                );
            } catch {
                // Ignore storage write failures.
            }
        },
        [],
    );

    // The date to request: daily journal period, or omit for today (server decides).
    const eventsDateParam =
        pageProps.noteType === 'journal' &&
        pageProps.journalGranularity === 'daily' &&
        typeof pageProps.journalPeriod === 'string'
            ? pageProps.journalPeriod
            : null;

    const fetchEvents = useCallback(
        (dateParam: string | null) => {
            if (eventsWorkspaceSlug === '') {
                return;
            }

            function requestEvents(nextDateParam: string | null): void {
                const url = nextDateParam
                    ? `/w/${eventsWorkspaceSlug}/events?date=${nextDateParam}`
                    : `/w/${eventsWorkspaceSlug}/events`;

                void fetch(url, {
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                })
                    .then((r) => r.json())
                    .then(
                        (data: {
                            date: string;
                            events: SidebarEvent[];
                            syncing?: boolean;
                        }) => {
                            setEvents(data.events ?? []);
                            setEventsDate(data.date ?? null);

                            if (data.syncing) {
                                setIsSyncing(true);
                                // Poll once after 3 s to pick up the freshly-synced events.
                                if (syncPollRef.current !== null) {
                                    window.clearTimeout(syncPollRef.current);
                                }
                                syncPollRef.current = window.setTimeout(() => {
                                    syncPollRef.current = null;
                                    setIsSyncing(false);
                                    requestEvents(nextDateParam);
                                }, 3000);
                            } else {
                                setIsSyncing(false);
                            }
                        },
                    )
                    .catch(() => {
                        // Keep existing events on error.
                    });
            }

            requestEvents(dateParam);
        },
        [eventsWorkspaceSlug],
    );

    // Fetch when the anchor date changes (e.g. navigating between daily notes).
    useEffect(() => {
        fetchEvents(eventsDateParam);
    }, [eventsDateParam, fetchEvents]);

    // Re-fetch after a timeblock save so the sidebar updates without a full reload.
    useEffect(() => {
        const handler = () => fetchEvents(eventsDateParam);
        window.addEventListener('sarth:timeblocks-updated', handler);
        return () =>
            window.removeEventListener('sarth:timeblocks-updated', handler);
    }, [eventsDateParam, fetchEvents]);

    const monthName = format(viewMonth, 'LLLL', { locale: dateLocale });
    const monthPeriod = format(viewMonth, 'yyyy-MM');
    const yearPeriod = format(viewMonth, 'yyyy');
    const indicatorRange = useMemo(() => {
        const start = startOfWeek(startOfMonth(viewMonth), {
            locale: dateLocale,
        });
        const end = endOfWeek(endOfMonth(viewMonth), { locale: dateLocale });

        return {
            start: format(start, 'yyyy-MM-dd'),
            end: format(end, 'yyyy-MM-dd'),
            cacheKey: `${format(start, 'yyyy-MM-dd')}:${format(end, 'yyyy-MM-dd')}`,
        };
    }, [dateLocale, viewMonth]);
    const visitJournal = (granularity: string, period: unknown) => {
        if (typeof period !== 'string') {
            return;
        }

        const normalizedPeriod = period.trim();
        if (
            normalizedPeriod === '' ||
            !isValidJournalPeriod(granularity, normalizedPeriod)
        ) {
            return;
        }

        const path = `/journal/${normalizedPeriod}`;

        router.get(path, {}, { preserveScroll: true, preserveState: false });
    };

    const prefetchJournal = (granularity: string, period: unknown) => {
        if (typeof period !== 'string') {
            return;
        }

        const normalizedPeriod = period.trim();
        if (
            normalizedPeriod === '' ||
            !isValidJournalPeriod(granularity, normalizedPeriod)
        ) {
            return;
        }

        const path = `/journal/${normalizedPeriod}`;

        if (
            typeof (router as unknown as { prefetch?: unknown }).prefetch !==
            'function'
        ) {
            return;
        }

        (
            router as unknown as {
                prefetch: (
                    url: string,
                    data?: Record<string, unknown>,
                    options?: { cacheFor?: number },
                ) => void;
            }
        ).prefetch(path, {}, { cacheFor: PREFETCH_CACHE_FOR_MS });
    };

    const clearPrefetchTimeout = () => {
        if (prefetchTimeoutRef.current === null) {
            return;
        }

        window.clearTimeout(prefetchTimeoutRef.current);
        prefetchTimeoutRef.current = null;
    };

    const schedulePrefetchJournal = (granularity: string, period: unknown) => {
        clearPrefetchTimeout();

        prefetchTimeoutRef.current = window.setTimeout(() => {
            prefetchJournal(granularity, period);
            prefetchTimeoutRef.current = null;
        }, PREFETCH_HOVER_DELAY_MS);
    };

    useEffect(() => {
        return () => {
            clearPrefetchTimeout();
        };
    }, []);

    useEffect(() => {
        return () => {
            if (syncPollRef.current !== null) {
                window.clearTimeout(syncPollRef.current);
            }
            if (monthSyncTimerRef.current !== null) {
                window.clearTimeout(monthSyncTimerRef.current);
            }
            if (monthSyncFollowUpRef.current !== null) {
                window.clearTimeout(monthSyncFollowUpRef.current);
            }
            if (indicatorPollRef.current !== null) {
                window.clearTimeout(indicatorPollRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const persisted = readStorageCache();
        if (Object.keys(persisted).length > 0) {
            indicatorCacheRef.current = {
                ...indicatorCacheRef.current,
                ...persisted,
            };
            Object.assign(indicatorMemoryCache, indicatorCacheRef.current);
        }
    }, [readStorageCache]);

    useEffect(() => {
        if (eventsWorkspaceSlug === '') {
            return;
        }

        const currentRangeKey = indicatorRange.cacheKey;
        const cached = indicatorCacheRef.current[currentRangeKey];
        if (cached?.days) {
            setDayIndicators(cached.days);
            setWeekIndicators(cached.weeks ?? {});
            setMonthIndicators(cached.months ?? {});
            setYearIndicators(cached.years ?? {});
        }

        const abortController = new AbortController();
        let disposed = false;
        let inFlight = false;

        const schedulePoll = (ms: number) => {
            if (disposed) {
                return;
            }
            if (indicatorPollRef.current !== null) {
                window.clearTimeout(indicatorPollRef.current);
            }
            indicatorPollRef.current = window.setTimeout(() => {
                void fetchIndicators();
            }, ms);
        };

        const fetchIndicators = async () => {
            if (disposed || inFlight) {
                return;
            }

            inFlight = true;

            try {
                const response = await fetch(
                    `/w/${eventsWorkspaceSlug}/events/indicators?start=${indicatorRange.start}&end=${indicatorRange.end}`,
                    {
                        credentials: 'same-origin',
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                        signal: abortController.signal,
                    },
                );

                if (!response.ok) {
                    schedulePoll(5000);
                    return;
                }

                const payload = (await response.json()) as IndicatorResponse;
                if (!payload.days) {
                    schedulePoll(5000);
                    return;
                }

                const nextVersion = payload.version ?? '';
                const cachedEntry = indicatorCacheRef.current[currentRangeKey];
                const hasChanged =
                    !cachedEntry || cachedEntry.version !== nextVersion;
                const serverPollingMs =
                    typeof payload.polling_ms === 'number' &&
                    payload.polling_ms >= 1000
                        ? payload.polling_ms
                        : (payload.pending_dates?.length ?? 0) > 0
                          ? 2000
                          : 300000;
                const hasPending = (payload.pending_dates?.length ?? 0) > 0;
                const pendingAttempt = hasPending
                    ? (indicatorPendingAttemptRef.current[currentRangeKey] ?? 0) + 1
                    : 0;
                indicatorPendingAttemptRef.current[currentRangeKey] =
                    pendingAttempt;
                indicatorErrorAttemptRef.current[currentRangeKey] = 0;
                const stableCount = hasChanged
                    ? 0
                    : (indicatorStableVersionCountRef.current[currentRangeKey] ??
                        0) + 1;
                indicatorStableVersionCountRef.current[currentRangeKey] =
                    stableCount;
                const pendingBackoffMs = hasPending
                    ? Math.min(
                          INDICATOR_MAX_POLLING_MS,
                          INDICATOR_PENDING_BASE_POLLING_MS *
                              Math.pow(2, Math.max(0, pendingAttempt - 1)),
                      )
                    : INDICATOR_IDLE_POLLING_MS;
                const nextPollingMs = Math.min(
                    INDICATOR_MAX_POLLING_MS,
                    Math.max(
                        INDICATOR_MIN_POLLING_MS,
                        hasPending
                            ? Math.max(serverPollingMs, pendingBackoffMs)
                            : Math.max(serverPollingMs, INDICATOR_IDLE_POLLING_MS),
                    ),
                );

                const nextCachedPayload: CachedIndicatorPayload = {
                    days: payload.days,
                    weeks: payload.weeks ?? {},
                    months: payload.months ?? {},
                    years: payload.years ?? {},
                    version: nextVersion,
                    fetchedAt: Date.now(),
                    pollingMs: nextPollingMs,
                };

                indicatorCacheRef.current[currentRangeKey] = nextCachedPayload;
                indicatorMemoryCache[currentRangeKey] = nextCachedPayload;

                // Always hydrate visible state from server payload; relying only
                // on version changes can leave the UI empty after remounts.
                setDayIndicators(payload.days);
                setWeekIndicators(payload.weeks ?? {});
                setMonthIndicators(payload.months ?? {});
                setYearIndicators(payload.years ?? {});

                if (hasChanged) {
                    writeStorageCache(indicatorCacheRef.current);
                }

                const pollMs =
                    typeof payload.polling_ms === 'number' &&
                    payload.polling_ms >= 1000
                        ? payload.polling_ms
                        : (payload.pending_dates?.length ?? 0) > 0
                          ? 2000
                          : 300000;
                schedulePoll(
                    Math.min(
                        INDICATOR_MAX_POLLING_MS,
                        Math.max(
                            INDICATOR_MIN_POLLING_MS,
                            hasPending
                                ? Math.max(pollMs, pendingBackoffMs)
                                : Math.max(pollMs, INDICATOR_IDLE_POLLING_MS),
                        ),
                    ),
                );
            } catch {
                const errorAttempt =
                    (indicatorErrorAttemptRef.current[currentRangeKey] ?? 0) + 1;
                indicatorErrorAttemptRef.current[currentRangeKey] = errorAttempt;
                const errorBackoffMs = Math.min(
                    INDICATOR_MAX_POLLING_MS,
                    INDICATOR_ERROR_BASE_POLLING_MS *
                        Math.pow(2, Math.max(0, errorAttempt - 1)),
                );
                schedulePoll(errorBackoffMs);
            } finally {
                inFlight = false;
            }
        };

        if (cached?.days) {
            const ageMs = Date.now() - cached.fetchedAt;
            if (ageMs < INDICATOR_CACHE_FRESH_FOR_MS) {
                const pollIn = Math.max(
                    INDICATOR_MIN_POLLING_MS,
                    cached.pollingMs - ageMs,
                );
                schedulePoll(pollIn);
            } else {
                void fetchIndicators();
            }
        } else {
            void fetchIndicators();
        }

        return () => {
            disposed = true;
            if (indicatorPollRef.current !== null) {
                window.clearTimeout(indicatorPollRef.current);
                indicatorPollRef.current = null;
            }
            abortController.abort();
        };
    }, [
        eventsWorkspaceSlug,
        indicatorRange,
        indicatorRefreshNonce,
        writeStorageCache,
    ]);

    const monthIndicator = monthIndicators[monthPeriod];
    const yearIndicator = yearIndicators[yearPeriod];
    const monthTooltip = formatWeekIndicatorTooltip(monthIndicator);
    const yearTooltip = formatWeekIndicatorTooltip(yearIndicator);

    useEffect(() => {
        if (eventsWorkspaceSlug === '') {
            return;
        }

        if (monthSyncTimerRef.current !== null) {
            window.clearTimeout(monthSyncTimerRef.current);
            monthSyncTimerRef.current = null;
        }
        if (monthSyncFollowUpRef.current !== null) {
            window.clearTimeout(monthSyncFollowUpRef.current);
            monthSyncFollowUpRef.current = null;
        }

        monthSyncTimerRef.current = window.setTimeout(() => {
            const period = format(viewMonth, 'yyyy-MM');
            const xsrfToken = document.cookie
                .split('; ')
                .find((c) => c.startsWith('XSRF-TOKEN='))
                ?.split('=')
                .slice(1)
                .join('=');

            void fetch(
                `/w/${eventsWorkspaceSlug}/calendar/ensure-period-synced`,
                {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        ...(xsrfToken
                            ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfToken) }
                            : {}),
                    },
                    body: JSON.stringify({ period }),
                },
            )
                .then(async (response) => {
                    if (!response.ok) {
                        return null;
                    }

                    return (await response.json()) as { syncing?: boolean };
                })
                .then((payload) => {
                    if (!payload?.syncing) {
                        return;
                    }

                    setIsSyncing(true);
                    monthSyncFollowUpRef.current = window.setTimeout(() => {
                        monthSyncFollowUpRef.current = null;
                        delete indicatorCacheRef.current[
                            indicatorRange.cacheKey
                        ];
                        setIndicatorRefreshNonce((current) => current + 1);
                        fetchEvents(eventsDateParam);
                        setIsSyncing(false);
                    }, 3000);
                })
                .catch(() => {
                    // Ignore ensure-period failures and continue with regular polling.
                });
        }, 1000);

        return () => {
            if (monthSyncTimerRef.current !== null) {
                window.clearTimeout(monthSyncTimerRef.current);
                monthSyncTimerRef.current = null;
            }
            if (monthSyncFollowUpRef.current !== null) {
                window.clearTimeout(monthSyncFollowUpRef.current);
                monthSyncFollowUpRef.current = null;
            }
        };
    }, [
        eventsDateParam,
        eventsWorkspaceSlug,
        fetchEvents,
        indicatorRange.cacheKey,
        viewMonth,
    ]);

    const refreshEvents = () => {
        if (isRefreshing || eventsWorkspaceSlug === '') {
            return;
        }

        setIsRefreshing(true);

        const xsrfToken = document.cookie
            .split('; ')
            .find((c) => c.startsWith('XSRF-TOKEN='))
            ?.split('=')
            .slice(1)
            .join('=');

        void fetch(`/w/${eventsWorkspaceSlug}/calendar/refresh`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...(xsrfToken
                    ? { 'X-XSRF-TOKEN': decodeURIComponent(xsrfToken) }
                    : {}),
            },
        })
            .catch(() => {
                // Ignore sync errors; still reload events below.
            })
            .finally(() => {
                fetchEvents(eventsDateParam);
                setIsRefreshing(false);
            });
    };

    const handleMonthChange = useCallback((nextMonth: Date) => {
        setViewMonth((currentMonth) => {
            if (
                currentMonth.getFullYear() === nextMonth.getFullYear() &&
                currentMonth.getMonth() === nextMonth.getMonth()
            ) {
                return currentMonth;
            }

            return nextMonth;
        });
    }, []);

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="flex h-16 items-center justify-between px-2">
                <div className="flex items-center gap-0.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-(--cell-size) p-0"
                        aria-label="Go to the Previous Year"
                        onClick={() =>
                            setViewMonth((current) => addMonths(current, -12))
                        }
                    >
                        <ChevronsLeft className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-(--cell-size) p-0"
                        aria-label="Go to the Previous Month"
                        onClick={() =>
                            setViewMonth((current) => addMonths(current, -1))
                        }
                    >
                        <ChevronLeft className="size-4" />
                    </Button>
                </div>

                <div className="flex items-center gap-1 text-sm font-medium">
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                className="relative h-8 px-2 text-sm capitalize"
                                onMouseEnter={() =>
                                    schedulePrefetchJournal(
                                        'monthly',
                                        monthPeriod,
                                    )
                                }
                                onMouseLeave={clearPrefetchTimeout}
                                onClick={() =>
                                    visitJournal('monthly', monthPeriod)
                                }
                            >
                                {monthName}
                                {monthIndicator &&
                                (monthIndicator.has_note ||
                                    monthIndicator.has_events ||
                                    monthIndicator.task_state !== 'none' ||
                                    monthIndicator.birthday_count > 0) ? (
                                    <span className="pointer-events-none absolute bottom-0.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5">
                                        {monthIndicator.has_note ? (
                                            <span className="size-1 rounded-full bg-zinc-950 ring-1 ring-background/90 dark:bg-zinc-50" />
                                        ) : null}
                                        {monthIndicator.has_events ? (
                                            <span className="size-1 rounded-full bg-cyan-600 ring-1 ring-background/90 dark:bg-cyan-400" />
                                        ) : null}
                                        {monthIndicator.birthday_count > 0 ? (
                                            <span className="size-1 rounded-full bg-fuchsia-600 ring-1 ring-background/90 dark:bg-fuchsia-400" />
                                        ) : null}
                                        {monthIndicator.task_state ===
                                        'all_completed' ? (
                                            <span className="size-1 rounded-full bg-lime-600 ring-1 ring-background/90 dark:bg-lime-400" />
                                        ) : null}
                                        {monthIndicator.task_state ===
                                        'open' ? (
                                            <span className="size-1 rounded-full bg-amber-600 ring-1 ring-background/90 dark:bg-amber-400" />
                                        ) : null}
                                        {monthIndicator.task_state ===
                                        'open_past' ? (
                                            <span className="size-1 rounded-full bg-red-600 ring-1 ring-background/90 dark:bg-red-400" />
                                        ) : null}
                                    </span>
                                ) : null}
                            </Button>
                        </TooltipTrigger>
                        {monthTooltip ? (
                            <TooltipContent side="top">
                                {monthTooltip}
                            </TooltipContent>
                        ) : null}
                    </Tooltip>
                    <Tooltip delayDuration={500}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                className="relative h-8 px-2 text-sm"
                                onMouseEnter={() =>
                                    schedulePrefetchJournal('yearly', yearPeriod)
                                }
                                onMouseLeave={clearPrefetchTimeout}
                                onClick={() => visitJournal('yearly', yearPeriod)}
                            >
                                {yearPeriod}
                                {yearIndicator &&
                                (yearIndicator.has_note ||
                                    yearIndicator.has_events ||
                                    yearIndicator.task_state !== 'none' ||
                                    yearIndicator.birthday_count > 0) ? (
                                    <span className="pointer-events-none absolute bottom-0.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5">
                                        {yearIndicator.has_note ? (
                                            <span className="size-1 rounded-full bg-zinc-950 ring-1 ring-background/90 dark:bg-zinc-50" />
                                        ) : null}
                                        {yearIndicator.has_events ? (
                                            <span className="size-1 rounded-full bg-cyan-600 ring-1 ring-background/90 dark:bg-cyan-400" />
                                        ) : null}
                                        {yearIndicator.birthday_count > 0 ? (
                                            <span className="size-1 rounded-full bg-fuchsia-600 ring-1 ring-background/90 dark:bg-fuchsia-400" />
                                        ) : null}
                                        {yearIndicator.task_state ===
                                        'all_completed' ? (
                                            <span className="size-1 rounded-full bg-lime-600 ring-1 ring-background/90 dark:bg-lime-400" />
                                        ) : null}
                                        {yearIndicator.task_state ===
                                        'open' ? (
                                            <span className="size-1 rounded-full bg-amber-600 ring-1 ring-background/90 dark:bg-amber-400" />
                                        ) : null}
                                        {yearIndicator.task_state ===
                                        'open_past' ? (
                                            <span className="size-1 rounded-full bg-red-600 ring-1 ring-background/90 dark:bg-red-400" />
                                        ) : null}
                                    </span>
                                ) : null}
                            </Button>
                        </TooltipTrigger>
                        {yearTooltip ? (
                            <TooltipContent side="top">
                                {yearTooltip}
                            </TooltipContent>
                        ) : null}
                    </Tooltip>
                </div>

                <div className="flex items-center gap-0.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-(--cell-size) p-0"
                        aria-label="Go to the Next Month"
                        onClick={() =>
                            setViewMonth((current) => addMonths(current, 1))
                        }
                    >
                        <ChevronRight className="size-4" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-(--cell-size) p-0"
                        aria-label="Go to the Next Year"
                        onClick={() =>
                            setViewMonth((current) => addMonths(current, 12))
                        }
                    >
                        <ChevronsRight className="size-4" />
                    </Button>
                </div>
            </div>

            <div className="shrink-0">
                <Calendar
                    key={calendarKey}
                    locale={dateLocale}
                    month={viewMonth}
                    onMonthChange={handleMonthChange}
                    defaultMonth={anchorDate ?? new Date()}
                    showWeekNumber
                    mode="single"
                    className="w-full bg-transparent p-0! [--cell-size:2.1rem]"
                    classNames={{
                        months: 'relative flex w-full',
                        month: 'flex w-full flex-col gap-1',
                        nav: 'hidden',
                        month_caption: 'hidden',
                        table: 'w-full table-fixed border-collapse',
                        weekdays: 'w-full',
                        week: 'mt-1 w-full',
                        day: 'group/day relative h-(--cell-size) w-(--cell-size) p-0 text-center text-sm align-middle select-none',
                        day_button: selectedDayClass,
                    }}
                    selected={activeDailyDate}
                    onDayMouseEnter={(day) =>
                        schedulePrefetchJournal(
                            'daily',
                            format(day, 'yyyy-MM-dd'),
                        )
                    }
                    onDayMouseLeave={clearPrefetchTimeout}
                    onDayClick={(day) =>
                        visitJournal('daily', format(day, 'yyyy-MM-dd'))
                    }
                    components={{
                        DayButton: (props) => {
                            const dateKey = format(
                                props.day.date,
                                'yyyy-MM-dd',
                            );
                            const indicator = dayIndicators[dateKey];
                            const hasTaskDot =
                                indicator && indicator.task_state !== 'none';
                            const hasBirthdayDot = Boolean(
                                indicator && indicator.birthday_count > 0,
                            );
                            const tooltipText =
                                formatIndicatorTooltip(indicator);
                            const hasAnyDot = Boolean(
                                indicator &&
                                (indicator.has_note ||
                                    indicator.has_events ||
                                    hasTaskDot ||
                                    hasBirthdayDot),
                            );

                            const dayButton = (
                                <div className="relative flex size-(--cell-size) items-center justify-center">
                                    <CalendarDayButton {...props} />
                                    {hasAnyDot ? (
                                        <span className="pointer-events-none absolute bottom-0.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5">
                                            {indicator.has_note ? (
                                                <span className="size-1 rounded-full bg-zinc-950 ring-1 ring-background/90 dark:bg-zinc-50" />
                                            ) : null}
                                            {indicator.has_events ? (
                                                <span className="size-1 rounded-full bg-cyan-600 ring-1 ring-background/90 dark:bg-cyan-400" />
                                            ) : null}
                                            {hasBirthdayDot ? (
                                                <span className="size-1 rounded-full bg-fuchsia-600 ring-1 ring-background/90 dark:bg-fuchsia-400" />
                                            ) : null}
                                            {indicator.task_state ===
                                            'all_completed' ? (
                                                <span className="size-1 rounded-full bg-lime-600 ring-1 ring-background/90 dark:bg-lime-400" />
                                            ) : null}
                                            {indicator.task_state === 'open' ? (
                                                <span className="size-1 rounded-full bg-amber-600 ring-1 ring-background/90 dark:bg-amber-400" />
                                            ) : null}
                                            {indicator.task_state ===
                                            'open_past' ? (
                                                <span className="size-1 rounded-full bg-red-600 ring-1 ring-background/90 dark:bg-red-400" />
                                            ) : null}
                                        </span>
                                    ) : null}
                                </div>
                            );

                            if (!tooltipText) {
                                return dayButton;
                            }

                            return (
                                <Tooltip delayDuration={500}>
                                    <TooltipTrigger asChild>
                                        {dayButton}
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                        {tooltipText}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        },
                        WeekNumber: ({ week, ...props }) => {
                            const anchor = week.days.at(0)?.date;
                            const weekNumber = week.weekNumber;
                            const currentWeeklyPeriod =
                                pageProps.noteType === 'journal' &&
                                pageProps.journalGranularity === 'weekly'
                                    ? pageProps.journalPeriod
                                    : null;
                            const anchorPeriod = anchor
                                ? `${getISOWeekYear(anchor)}-W${String(
                                      getISOWeek(anchor),
                                  ).padStart(2, '0')}`
                                : null;
                            const isActive = Boolean(
                                currentWeeklyPeriod &&
                                anchorPeriod &&
                                currentWeeklyPeriod === anchorPeriod,
                            );
                            const weekIndicator = anchorPeriod
                                ? weekIndicators[anchorPeriod]
                                : undefined;
                            const hasAnyWeekDot = Boolean(
                                weekIndicator &&
                                (weekIndicator.has_note ||
                                    weekIndicator.has_events ||
                                    weekIndicator.task_state !== 'none' ||
                                    weekIndicator.birthday_count > 0),
                            );
                            const weekTooltip =
                                formatWeekIndicatorTooltip(weekIndicator);

                            const weekButton = (
                                <button
                                    type="button"
                                    className={cn(
                                        'relative inline-flex h-(--cell-size) w-(--cell-size) cursor-pointer items-center justify-center rounded-md text-center text-sm font-light hover:bg-muted',
                                        isActive && selectedWeekClass,
                                    )}
                                    onMouseEnter={() => {
                                        if (!anchor) {
                                            return;
                                        }

                                        const isoYear = getISOWeekYear(anchor);
                                        const isoWeek = String(
                                            getISOWeek(anchor),
                                        ).padStart(2, '0');
                                        schedulePrefetchJournal(
                                            'weekly',
                                            `${isoYear}-W${isoWeek}`,
                                        );
                                    }}
                                    onMouseLeave={clearPrefetchTimeout}
                                    onFocus={() => {
                                        if (!anchor) {
                                            return;
                                        }

                                        const isoYear = getISOWeekYear(anchor);
                                        const isoWeek = String(
                                            getISOWeek(anchor),
                                        ).padStart(2, '0');
                                        prefetchJournal(
                                            'weekly',
                                            `${isoYear}-W${isoWeek}`,
                                        );
                                    }}
                                    onClick={() => {
                                        if (!anchor) {
                                            return;
                                        }

                                        const isoYear = getISOWeekYear(anchor);
                                        const isoWeek = String(
                                            getISOWeek(anchor),
                                        ).padStart(2, '0');
                                        visitJournal(
                                            'weekly',
                                            `${isoYear}-W${isoWeek}`,
                                        );
                                    }}
                                    aria-label={`Open weekly note for week ${weekNumber}`}
                                >
                                    {weekNumber}
                                    {hasAnyWeekDot ? (
                                        <span className="pointer-events-none absolute bottom-0.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-0.5">
                                            {weekIndicator?.has_note ? (
                                                <span className="size-1 rounded-full bg-zinc-950 ring-1 ring-background/90 dark:bg-zinc-50" />
                                            ) : null}
                                            {weekIndicator?.has_events ? (
                                                <span className="size-1 rounded-full bg-cyan-600 ring-1 ring-background/90 dark:bg-cyan-400" />
                                            ) : null}
                                            {(weekIndicator?.birthday_count ?? 0) >
                                            0 ? (
                                                <span className="size-1 rounded-full bg-fuchsia-600 ring-1 ring-background/90 dark:bg-fuchsia-400" />
                                            ) : null}
                                            {weekIndicator?.task_state ===
                                            'all_completed' ? (
                                                <span className="size-1 rounded-full bg-lime-600 ring-1 ring-background/90 dark:bg-lime-400" />
                                            ) : null}
                                            {weekIndicator?.task_state ===
                                            'open' ? (
                                                <span className="size-1 rounded-full bg-amber-600 ring-1 ring-background/90 dark:bg-amber-400" />
                                            ) : null}
                                            {weekIndicator?.task_state ===
                                            'open_past' ? (
                                                <span className="size-1 rounded-full bg-red-600 ring-1 ring-background/90 dark:bg-red-400" />
                                            ) : null}
                                        </span>
                                    ) : null}
                                </button>
                            );

                            return (
                                <th {...props}>
                                    {weekTooltip ? (
                                        <Tooltip delayDuration={500}>
                                            <TooltipTrigger asChild>
                                                {weekButton}
                                            </TooltipTrigger>
                                            <TooltipContent side="top">
                                                {weekTooltip}
                                            </TooltipContent>
                                        </Tooltip>
                                    ) : (
                                        weekButton
                                    )}
                                </th>
                            );
                        },
                    }}
                />
            </div>

            <Tabs
                value={activeSidebarTab}
                onValueChange={(value) =>
                    setActiveSidebarTab(value as 'events' | 'meetings')
                }
                className="mt-3 min-h-0 flex-1"
            >
                <div className="px-2 pb-2">
                    <TabsList className="h-8">
                        <TabsTrigger
                            value="events"
                            className="px-2.5 py-1 text-xs"
                        >
                            {language === 'en' ? 'Events' : 'Evenementen'}
                        </TabsTrigger>
                        {hasMeetingsTab ? (
                            <TabsTrigger
                                value="meetings"
                                className="px-2.5 py-1 text-xs"
                            >
                                {language === 'en' ? 'Meetings' : 'Vergaderingen'}
                            </TabsTrigger>
                        ) : null}
                    </TabsList>
                </div>

                <TabsContent value="events" className="min-h-0 flex-1">
                    <RightSidebarTodayEvents
                        events={events}
                        language={language}
                        anchorDate={eventsDate}
                        timeblockColor={
                            pageProps.currentWorkspace?.timeblock_color ??
                            pageProps.currentWorkspace?.color ??
                            null
                        }
                        workspaceColor={pageProps.currentWorkspace?.color ?? null}
                        dateLongFormat={
                            pageProps.auth?.user?.settings?.date_long_format ??
                            null
                        }
                        timeFormat={pageProps.auth?.user?.settings?.time_format ?? null}
                        timezone={pageProps.auth?.user?.settings?.timezone ?? null}
                        onRefresh={
                            eventsWorkspaceSlug !== '' ? refreshEvents : undefined
                        }
                        isRefreshing={isRefreshing || isSyncing}
                        className="min-h-0 flex-1"
                    />
                </TabsContent>

                {hasMeetingsTab ? (
                    <TabsContent value="meetings" className="min-h-0 flex-1">
                        <MeetingNotesSidebar
                            meetingNotes={tabMeetingNotes}
                            language={language}
                            currentNoteId={pageProps.noteId ?? null}
                            embedded
                            className="h-full"
                        />
                    </TabsContent>
                ) : null}
            </Tabs>
        </section>
    );
}
