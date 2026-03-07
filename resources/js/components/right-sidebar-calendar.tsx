import { router, usePage } from '@inertiajs/react';
import { format, getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

type JournalPageProps = {
    noteType?: string;
    journalGranularity?: string | null;
    journalPeriod?: string | null;
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

export function RightSidebarCalendar() {
    const pageProps = usePage().props as JournalPageProps;
    const activeDailyDate =
        pageProps.noteType === 'journal' &&
        pageProps.journalGranularity === 'daily' &&
        pageProps.journalPeriod
            ? parseJournalPeriod('daily', pageProps.journalPeriod)
            : undefined;
    const anchorDate = useMemo(
        () =>
            parseJournalPeriod(
                pageProps.journalGranularity,
                pageProps.journalPeriod,
            ),
        [pageProps.journalGranularity, pageProps.journalPeriod],
    );
    const [month, setMonth] = useState<Date>(anchorDate ?? new Date());

    useEffect(() => {
        if (!anchorDate) {
            return;
        }

        setMonth(anchorDate);
    }, [anchorDate]);

    const visitJournal = (path: string) => {
        router.get(path, {}, { preserveScroll: true, preserveState: false });
    };

    return (
        <section className="mx-1 mb-2 mt-0 space-y-1 overflow-hidden rounded-xl border border-sidebar-border bg-background shadow-sm">
            <Calendar
                locale={nl}
                month={month}
                onMonthChange={setMonth}
                showWeekNumber
                mode="single"
                className="w-full bg-transparent !p-1 [--cell-size:2.1rem]"
                selected={activeDailyDate}
                onDayClick={(day) =>
                    visitJournal(`/journal/daily/${format(day, 'yyyy-MM-dd')}`)
                }
                components={{
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
                                        'inline-flex h-(--cell-size) w-(--cell-size) cursor-pointer items-center justify-center rounded-md text-center text-sm font-light hover:bg-accent hover:text-accent-foreground',
                                        isActive &&
                                            'bg-accent text-accent-foreground',
                                    )}
                                    onClick={() => {
                                        if (!anchor) {
                                            return;
                                        }

                                        const isoYear = getISOWeekYear(anchor);
                                        const isoWeek = String(
                                            getISOWeek(anchor),
                                        ).padStart(2, '0');
                                        visitJournal(
                                            `/journal/weekly/${isoYear}-W${isoWeek}`,
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
        </section>
    );
}
