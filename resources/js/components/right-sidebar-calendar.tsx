import { router, usePage } from '@inertiajs/react';
import { addMonths, format, getISOWeek, getISOWeekYear, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type JournalPageProps = {
    noteType?: string;
    journalGranularity?: string | null;
    journalPeriod?: string | null;
    auth?: {
        user?: {
            settings?: {
                language?: string;
            };
        };
    };
    currentWorkspace?: {
        color?: string | null;
    };
};

const CALENDAR_SELECTED_DAY_CLASS: Record<string, string> = {
    black: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-black data-[selected-single=true]:text-white',
    slate: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-slate-600 data-[selected-single=true]:text-white',
    zinc: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-zinc-600 data-[selected-single=true]:text-white',
    stone: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-stone-600 data-[selected-single=true]:text-white',
    red: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-red-600 data-[selected-single=true]:text-white',
    orange: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-orange-600 data-[selected-single=true]:text-white',
    amber: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-amber-600 data-[selected-single=true]:text-white',
    yellow: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-yellow-500 data-[selected-single=true]:text-black',
    lime: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-lime-600 data-[selected-single=true]:text-white',
    green: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-green-600 data-[selected-single=true]:text-white',
    emerald: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-emerald-600 data-[selected-single=true]:text-white',
    teal: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-teal-600 data-[selected-single=true]:text-white',
    cyan: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-cyan-600 data-[selected-single=true]:text-white',
    sky: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-sky-600 data-[selected-single=true]:text-white',
    blue: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-blue-600 data-[selected-single=true]:text-white',
    indigo: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-indigo-600 data-[selected-single=true]:text-white',
    violet: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-violet-600 data-[selected-single=true]:text-white',
    purple: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-purple-600 data-[selected-single=true]:text-white',
    fuchsia: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-fuchsia-600 data-[selected-single=true]:text-white',
    pink: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-pink-600 data-[selected-single=true]:text-white',
    rose: 'rounded-full hover:bg-muted data-[selected-single=true]:bg-rose-600 data-[selected-single=true]:text-white',
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

export function RightSidebarCalendar() {
    const pageProps = usePage().props as JournalPageProps;
    const language = pageProps.auth?.user?.settings?.language === 'en' ? 'en' : 'nl';
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
    const calendarKey = anchorDate
        ? format(anchorDate, 'yyyy-MM-dd')
        : 'default-month';
    const [viewMonth, setViewMonth] = useState<Date>(anchorDate ?? new Date());
    const [monthPickerOpen, setMonthPickerOpen] = useState(false);
    const [pickerYear, setPickerYear] = useState(viewMonth.getFullYear());

    const monthLabel = format(viewMonth, 'LLLL yyyy', { locale: dateLocale });
    const monthNames = useMemo(
        () =>
            Array.from({ length: 12 }, (_, monthIndex) =>
                format(new Date(pickerYear, monthIndex, 1), 'LLLL', {
                    locale: dateLocale,
                }),
            ),
        [dateLocale, pickerYear],
    );

    const visitJournal = (path: string) => {
        router.get(path, {}, { preserveScroll: true, preserveState: false });
    };

    return (
        <section className="space-y-1 overflow-hidden">
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

                <Popover
                    open={monthPickerOpen}
                    onOpenChange={(nextOpen) => {
                        setMonthPickerOpen(nextOpen);
                        if (nextOpen) {
                            setPickerYear(viewMonth.getFullYear());
                        }
                    }}
                >
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            className="h-8 gap-1.5 px-2 text-sm font-medium capitalize"
                        >
                            {monthLabel}
                            <ChevronDown className="size-3.5 opacity-70" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="center" className="w-64 p-2">
                        <div className="mb-2 flex items-center justify-between">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Previous Year"
                                onClick={() => setPickerYear((year) => year - 1)}
                            >
                                <ChevronLeft className="size-4" />
                            </Button>
                            <div className="text-sm font-medium">{pickerYear}</div>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Next Year"
                                onClick={() => setPickerYear((year) => year + 1)}
                            >
                                <ChevronRight className="size-4" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-3 gap-1">
                            {monthNames.map((name, index) => {
                                const isSelected =
                                    viewMonth.getFullYear() === pickerYear &&
                                    viewMonth.getMonth() === index;

                                return (
                                    <Button
                                        key={`${name}-${index}`}
                                        type="button"
                                        variant={isSelected ? 'secondary' : 'ghost'}
                                        className="h-8 justify-center px-2 text-xs capitalize"
                                        onClick={() => {
                                            setViewMonth(new Date(pickerYear, index, 1));
                                            setMonthPickerOpen(false);
                                        }}
                                    >
                                        {name}
                                    </Button>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>

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

            <Calendar
                key={calendarKey}
                locale={dateLocale}
                month={viewMonth}
                onMonthChange={setViewMonth}
                defaultMonth={anchorDate ?? new Date()}
                showWeekNumber
                mode="single"
                className="w-full bg-transparent !p-0 [--cell-size:2.1rem]"
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
                                        'inline-flex h-(--cell-size) w-(--cell-size) cursor-pointer items-center justify-center rounded-full text-center text-sm font-light hover:bg-muted',
                                        isActive && selectedWeekClass,
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
