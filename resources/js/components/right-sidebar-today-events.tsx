import { router } from '@inertiajs/react';
import { isValid, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
    COLOR_SWATCH_THEME_BG_CLASS,
    COLOR_SWATCH_THEME_BORDER_CLASS,
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
    note_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    location: string | null;
    task_block_id: string | null;
    task_checked: boolean | null;
    task_status: string | null;
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
    const [eventItems, setEventItems] = useState<SidebarTodayEvent[]>(events);
    const [pendingTaskBlockIds, setPendingTaskBlockIds] = useState<string[]>([]);

    useEffect(() => {
        setEventItems(events);
    }, [events]);
    const emptyLabel =
        language === 'en' ? 'No events planned for this day.' : 'Geen events gepland voor deze dag.';
    const normalizedTimeblockColor = (
        timeblockColor ??
        workspaceColor ??
        'sky'
    ).toLowerCase();
    const normalizedWorkspaceColor = (workspaceColor ?? 'slate').toLowerCase();
    const timeblockAccent = (COLOR_SWATCH_THEME_BG_CLASS as Record<string, string>)[normalizedTimeblockColor]
        ?? COLOR_SWATCH_THEME_BG_CLASS.sky;
    const workspaceAccent = (COLOR_SWATCH_THEME_BG_CLASS as Record<string, string>)[normalizedWorkspaceColor]
        ?? COLOR_SWATCH_THEME_BG_CLASS.slate;
    const timeblockBorder = (COLOR_SWATCH_THEME_BORDER_CLASS as Record<string, string>)[normalizedTimeblockColor]
        ?? COLOR_SWATCH_THEME_BORDER_CLASS.sky;
    const workspaceBorder = (COLOR_SWATCH_THEME_BORDER_CLASS as Record<string, string>)[normalizedWorkspaceColor]
        ?? COLOR_SWATCH_THEME_BORDER_CLASS.slate;
    const neutralCardClass = 'bg-zinc-100 dark:bg-zinc-900';

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
                    {eventItems.map((event, index) => {
                        const linkedBlockId =
                            typeof event.task_block_id === 'string' && event.task_block_id !== ''
                                ? event.task_block_id
                                : null;
                        const isTaskTogglePending =
                            linkedBlockId !== null && pendingTaskBlockIds.includes(linkedBlockId);
                        const toggleLinkedTask = () => {
                            if (
                                !linkedBlockId ||
                                !event.note_id ||
                                isTaskTogglePending
                            ) {
                                return;
                            }

                            const isBacklogPromotion =
                                event.task_status === 'backlog' &&
                                event.task_checked !== true;
                            const nextChecked = isBacklogPromotion
                                ? false
                                : !event.task_checked;

                            setPendingTaskBlockIds((current) => [...current, linkedBlockId]);
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
                                                        task_checked: nextChecked,
                                                        task_status: isBacklogPromotion
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
                                            current.filter((blockId) => blockId !== linkedBlockId),
                                        );
                                    },
                                },
                            );
                        };

                        const timeRange = formatTimeRange(
                            event.starts_at,
                            event.ends_at,
                            preferredTimeFormat,
                        );
                        const isTimeblock = event.type === 'timeblock';
                        const hasLinkedTask = isTimeblock && !!event.task_block_id;
                        const isLinkedTaskCompleted = hasLinkedTask && Boolean(event.task_checked);
                        const checkboxBorderClass = isTimeblock ? timeblockBorder : workspaceBorder;
                        const checkboxAccentClass = isTimeblock ? timeblockAccent : workspaceAccent;
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
                                            neutralCardClass,
                                            !isTimeblock && 'border border-sidebar-border/60',
                                            isLinkedTaskCompleted && 'opacity-70',
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            {!hasLinkedTask ? (
                                                <span
                                                    className={cn(
                                                        'h-12 w-1 shrink-0 rounded-full',
                                                        isTimeblock ? timeblockAccent : workspaceAccent,
                                                    )}
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    {hasLinkedTask ? (
                                                        <button
                                                            type="button"
                                                            onClick={toggleLinkedTask}
                                                            disabled={isTaskTogglePending}
                                                            aria-label={
                                                                language === 'en'
                                                                    ? 'Toggle linked task'
                                                                    : 'Gekoppelde taak wisselen'
                                                            }
                                                            className={cn(
                                                                'inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full border-2 transition-opacity',
                                                                isTaskTogglePending && 'opacity-60',
                                                                isLinkedTaskCompleted && 'opacity-70',
                                                                isLinkedTaskCompleted
                                                                    ? cn(checkboxBorderClass, checkboxAccentClass, 'text-white dark:text-black')
                                                                    : cn(checkboxBorderClass, 'bg-transparent text-transparent'),
                                                            )}
                                                        >
                                                            <Check className="h-3.5 w-3.5 stroke-[4]" />
                                                        </button>
                                                    ) : null}
                                                    <p
                                                        className={cn(
                                                            'truncate text-[0.88rem] leading-tight font-medium text-foreground',
                                                            isLinkedTaskCompleted && 'line-through',
                                                        )}
                                                    >
                                                        {event.title}
                                                    </p>
                                                </div>

                                                <p
                                                    className={cn(
                                                        'mt-1 truncate text-[0.72rem] text-zinc-600 dark:text-zinc-300',
                                                        hasLinkedTask && 'ml-[1.625rem]',
                                                    )}
                                                >
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
