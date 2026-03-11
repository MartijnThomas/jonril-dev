import { isValid, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import {
    COLOR_SWATCH_THEME_BG_CLASS,
} from '@/components/color-swatch-picker';
import {
    formatClockTime,
    formatLongDate,
    resolveLongDateFormat,
    resolveTimeFormat,
} from '@/lib/user-date-time-format';
import { cn } from '@/lib/utils';

type SidebarTodayEvent = {
    id: string;
    type: 'timeblock' | 'event';
    title: string;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
    note_title: string | null;
    href: string | null;
};

type RightSidebarTodayEventsProps = {
    events: SidebarTodayEvent[];
    language: 'nl' | 'en';
    anchorDate?: string | null;
    timeblockColor?: string | null;
    workspaceColor?: string | null;
    dateLongFormat?: string | null;
    timeFormat?: string | null;
};

function formatTimeRange(
    startsAt: string | null,
    endsAt: string | null,
    preferredTimeFormat: '24h' | '12h',
): string {
    if (!startsAt || !endsAt) {
        return '--:--';
    }

    const start = parseISO(startsAt);
    const end = parseISO(endsAt);

    if (!isValid(start) || !isValid(end)) {
        return '--:--';
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

    const gapMinutes = Math.round((nextStart.getTime() - previousEnd.getTime()) / 60000);
    if (gapMinutes <= 0) {
        return null;
    }

    const hours = Math.floor(gapMinutes / 60);
    const minutes = gapMinutes % 60;

    if (language === 'nl') {
        if (hours > 0 && minutes > 0) {
            return `${hours} uur ${minutes} min tussen`;
        }

        if (hours > 0) {
            return `${hours} uur tussen`;
        }

        return `${minutes} min tussen`;
    }

    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m between`;
    }

    if (hours > 0) {
        return `${hours}h between`;
    }

    return `${minutes}m between`;
}

export function RightSidebarTodayEvents({
    events,
    language,
    anchorDate = null,
    timeblockColor = null,
    workspaceColor = null,
    dateLongFormat = null,
    timeFormat = null,
}: RightSidebarTodayEventsProps) {
    const capitalizeFirst = (value: string): string =>
        value.length > 0 ? value.charAt(0).toUpperCase() + value.slice(1) : value;

    const locale = language === 'en' ? enUS : nl;
    const preferredLongDateFormat = resolveLongDateFormat(
        dateLongFormat,
        language,
    );
    const preferredTimeFormat = resolveTimeFormat(timeFormat, language);
    const parsedAnchorDate = anchorDate && isValid(parseISO(anchorDate))
        ? parseISO(anchorDate)
        : new Date();
    const headerLabel = capitalizeFirst(
        formatLongDate(parsedAnchorDate, locale, preferredLongDateFormat),
    );
    const emptyLabel =
        language === 'en' ? 'No events planned for this day.' : 'Geen events gepland voor deze dag.';
    const normalizedTimeblockColor = (timeblockColor ?? 'sky').toLowerCase();
    const normalizedWorkspaceColor = (workspaceColor ?? 'slate').toLowerCase();
    const timeblockAccent = (COLOR_SWATCH_THEME_BG_CLASS as Record<string, string>)[normalizedTimeblockColor]
        ?? COLOR_SWATCH_THEME_BG_CLASS.sky;
    const workspaceAccent = (COLOR_SWATCH_THEME_BG_CLASS as Record<string, string>)[normalizedWorkspaceColor]
        ?? COLOR_SWATCH_THEME_BG_CLASS.slate;
    const timeblockTintClass = (() => {
        const tintMap: Record<string, string> = {
            black: 'bg-zinc-100 dark:bg-zinc-900',
            slate: 'bg-slate-100 dark:bg-slate-900',
            zinc: 'bg-zinc-100 dark:bg-zinc-900',
            stone: 'bg-stone-100 dark:bg-stone-900',
            red: 'bg-red-50 dark:bg-red-950',
            orange: 'bg-orange-50 dark:bg-orange-950',
            amber: 'bg-amber-50 dark:bg-amber-950',
            yellow: 'bg-yellow-50 dark:bg-yellow-950',
            lime: 'bg-lime-50 dark:bg-lime-950',
            green: 'bg-green-50 dark:bg-green-950',
            emerald: 'bg-emerald-50 dark:bg-emerald-950',
            teal: 'bg-teal-50 dark:bg-teal-950',
            cyan: 'bg-cyan-50 dark:bg-cyan-950',
            sky: 'bg-sky-50 dark:bg-sky-950',
            blue: 'bg-blue-50 dark:bg-blue-950',
            indigo: 'bg-indigo-50 dark:bg-indigo-950',
            violet: 'bg-violet-50 dark:bg-violet-950',
            purple: 'bg-purple-50 dark:bg-purple-950',
            fuchsia: 'bg-fuchsia-50 dark:bg-fuchsia-950',
            pink: 'bg-pink-50 dark:bg-pink-950',
            rose: 'bg-rose-50 dark:bg-rose-950',
        };

        return tintMap[normalizedTimeblockColor] ?? tintMap.sky;
    })();
    const workspaceTintClass = (() => {
        const tintMap: Record<string, string> = {
            black: 'bg-zinc-100 dark:bg-zinc-900',
            slate: 'bg-slate-100 dark:bg-slate-900',
            zinc: 'bg-zinc-100 dark:bg-zinc-900',
            stone: 'bg-stone-100 dark:bg-stone-900',
            red: 'bg-red-50 dark:bg-red-950',
            orange: 'bg-orange-50 dark:bg-orange-950',
            amber: 'bg-amber-50 dark:bg-amber-950',
            yellow: 'bg-yellow-50 dark:bg-yellow-950',
            lime: 'bg-lime-50 dark:bg-lime-950',
            green: 'bg-green-50 dark:bg-green-950',
            emerald: 'bg-emerald-50 dark:bg-emerald-950',
            teal: 'bg-teal-50 dark:bg-teal-950',
            cyan: 'bg-cyan-50 dark:bg-cyan-950',
            sky: 'bg-sky-50 dark:bg-sky-950',
            blue: 'bg-blue-50 dark:bg-blue-950',
            indigo: 'bg-indigo-50 dark:bg-indigo-950',
            violet: 'bg-violet-50 dark:bg-violet-950',
            purple: 'bg-purple-50 dark:bg-purple-950',
            fuchsia: 'bg-fuchsia-50 dark:bg-fuchsia-950',
            pink: 'bg-pink-50 dark:bg-pink-950',
            rose: 'bg-rose-50 dark:bg-rose-950',
        };

        return tintMap[normalizedWorkspaceColor] ?? tintMap.slate;
    })();

    return (
        <section className="mt-2 border-t border-sidebar-border/60 px-2 pt-2 pb-2">
            <header className="mb-2 px-1 pt-1.5 pb-1.5">
                <h3 className="text-[0.82rem] font-medium text-zinc-600 dark:text-zinc-400">
                    {headerLabel}
                </h3>
            </header>

            {events.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground/90">{emptyLabel}</p>
            ) : (
                <ul className="space-y-1.5">
                    {events.map((event, index) => {
                        const timeRange = formatTimeRange(
                            event.starts_at,
                            event.ends_at,
                            preferredTimeFormat,
                        );
                        const isTimeblock = event.type === 'timeblock';
                        const durationLabel = isTimeblock
                            ? formatDurationLabel(event.starts_at, event.ends_at, language)
                            : null;
                        const nextEvent = events[index + 1] ?? null;
                        const gapLabel = nextEvent
                            ? formatGapLabel(event.ends_at, nextEvent.starts_at, language)
                            : null;

                        return [
                                <li key={event.id}>
                                    <article
                                        className={cn(
                                            'rounded-lg px-3 py-2 shadow-sm',
                                            workspaceTintClass,
                                            isTimeblock ? timeblockTintClass : null,
                                            !isTimeblock && 'border border-sidebar-border/60',
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span
                                                className={cn(
                                                    'h-12 w-1 shrink-0 rounded-full',
                                                    isTimeblock ? timeblockAccent : workspaceAccent,
                                                )}
                                                aria-hidden="true"
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-[0.88rem] leading-tight font-medium text-foreground">
                                                    {event.title}
                                                </p>

                                                <p className="mt-1 truncate text-[0.72rem] text-zinc-600 dark:text-zinc-300">
                                                    {timeRange}
                                                    {durationLabel ? ` (${durationLabel})` : ''}
                                                    {event.location ? `  @${event.location}` : ''}
                                                </p>
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
            )}
        </section>
    );
}
