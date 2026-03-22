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
import { RightSidebarTodayEvents } from '@/components/right-sidebar-today-events';
import { Button } from '@/components/ui/button';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';
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
    noteType?: string;
    journalGranularity?: string | null;
    journalPeriod?: string | null;
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

type IndicatorResponse = {
    days?: Record<string, DayIndicator>;
    pending_dates?: string[];
    version?: string;
    polling_ms?: number;
};

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
    black: 'rounded-full bg-black text-white',
    slate: 'rounded-full bg-slate-600 text-white',
    zinc: 'rounded-full bg-zinc-600 text-white',
    stone: 'rounded-full bg-stone-600 text-white',
    red: 'rounded-full bg-red-600 text-white',
    orange: 'rounded-full bg-orange-600 text-white',
    amber: 'rounded-full bg-amber-600 text-white',
    yellow: 'rounded-full bg-yellow-500 text-black',
    lime: 'rounded-full bg-lime-600 text-white',
    green: 'rounded-full bg-green-600 text-white',
    emerald: 'rounded-full bg-emerald-600 text-white',
    teal: 'rounded-full bg-teal-600 text-white',
    cyan: 'rounded-full bg-cyan-600 text-white',
    sky: 'rounded-full bg-sky-600 text-white',
    blue: 'rounded-full bg-blue-600 text-white',
    indigo: 'rounded-full bg-indigo-600 text-white',
    violet: 'rounded-full bg-violet-600 text-white',
    purple: 'rounded-full bg-purple-600 text-white',
    fuchsia: 'rounded-full bg-fuchsia-600 text-white',
    pink: 'rounded-full bg-pink-600 text-white',
    rose: 'rounded-full bg-rose-600 text-white',
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
    const indicatorCacheRef = useRef<
        Record<string, { days: Record<string, DayIndicator>; version: string }>
    >({});
    const indicatorPollRef = useRef<number | null>(null);
    const [indicatorRefreshNonce, setIndicatorRefreshNonce] = useState(0);

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
        if (eventsWorkspaceSlug === '') {
            return;
        }

        const currentRangeKey = indicatorRange.cacheKey;
        const cached = indicatorCacheRef.current[currentRangeKey];
        if (cached?.days) {
            setDayIndicators(cached.days);
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
                if (hasChanged) {
                    indicatorCacheRef.current[currentRangeKey] = {
                        days: payload.days,
                        version: nextVersion,
                    };
                    setDayIndicators(payload.days);
                }

                const pollMs =
                    typeof payload.polling_ms === 'number' &&
                    payload.polling_ms >= 1000
                        ? payload.polling_ms
                        : (payload.pending_dates?.length ?? 0) > 0
                          ? 2000
                          : 300000;
                schedulePoll(pollMs);
            } catch {
                schedulePoll(5000);
            } finally {
                inFlight = false;
            }
        };

        const initialDelay = cached ? 250 : 750;
        schedulePoll(initialDelay);

        return () => {
            disposed = true;
            if (indicatorPollRef.current !== null) {
                window.clearTimeout(indicatorPollRef.current);
                indicatorPollRef.current = null;
            }
            abortController.abort();
        };
    }, [eventsWorkspaceSlug, indicatorRange, indicatorRefreshNonce]);

    useEffect(() => {
        setDayIndicators({});
    }, [eventsWorkspaceSlug]);

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
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2 text-sm capitalize"
                        onMouseEnter={() =>
                            schedulePrefetchJournal('monthly', monthPeriod)
                        }
                        onMouseLeave={clearPrefetchTimeout}
                        onClick={() => visitJournal('monthly', monthPeriod)}
                    >
                        {monthName}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="h-8 px-2 text-sm"
                        onMouseEnter={() =>
                            schedulePrefetchJournal('yearly', yearPeriod)
                        }
                        onMouseLeave={clearPrefetchTimeout}
                        onClick={() => visitJournal('yearly', yearPeriod)}
                    >
                        {yearPeriod}
                    </Button>
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

                            return (
                                <th {...props}>
                                    <button
                                        type="button"
                                        className={cn(
                                            'inline-flex h-(--cell-size) w-(--cell-size) cursor-pointer items-center justify-center rounded-full text-center text-sm font-light hover:bg-muted',
                                            isActive && selectedWeekClass,
                                        )}
                                        onMouseEnter={() => {
                                            if (!anchor) {
                                                return;
                                            }

                                            const isoYear =
                                                getISOWeekYear(anchor);
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

                                            const isoYear =
                                                getISOWeekYear(anchor);
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

                                            const isoYear =
                                                getISOWeekYear(anchor);
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
                                    </button>
                                </th>
                            );
                        },
                    }}
                />
            </div>

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
                    pageProps.auth?.user?.settings?.date_long_format ?? null
                }
                timeFormat={pageProps.auth?.user?.settings?.time_format ?? null}
                timezone={pageProps.auth?.user?.settings?.timezone ?? null}
                onRefresh={
                    eventsWorkspaceSlug !== '' ? refreshEvents : undefined
                }
                isRefreshing={isRefreshing || isSyncing}
                className="min-h-0 flex-1"
            />
        </section>
    );
}
