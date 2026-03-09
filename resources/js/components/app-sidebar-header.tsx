import { router, usePage } from '@inertiajs/react';
import { addDays, addMonths, addWeeks, addYears, format } from 'date-fns';
import {
    ChevronLeft,
    ChevronRight,
    PanelRightClose,
    PanelRightOpen,
} from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { NoteHeaderActions } from '@/components/note-header-actions';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';

type JournalPageProps = {
    noteType?: string;
    journalGranularity?: string | null;
    journalPeriod?: string | null;
    noteActions?: {
        id: string;
        title: string;
        path?: string | null;
        parent_id?: string | null;
        parent_path?: string | null;
        canMove?: boolean;
        canRename?: boolean;
        canDelete?: boolean;
        canClear?: boolean;
    } | null;
    moveParentOptions?: Array<{ id: string; title: string; path: string }>;
};

function parseWeekly(period: string): Date | null {
    const match = period.match(/^(\d{4})-W(\d{2})$/);
    if (!match) {
        return null;
    }

    const isoYear = Number(match[1]);
    const isoWeek = Number(match[2]);
    if (Number.isNaN(isoYear) || Number.isNaN(isoWeek)) {
        return null;
    }

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

function parseJournalDate(granularity: string, period: string): Date | null {
    if (granularity === 'daily') {
        const match = period.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) {
            return null;
        }

        return new Date(
            Number(match[1]),
            Number(match[2]) - 1,
            Number(match[3]),
        );
    }

    if (granularity === 'weekly') {
        return parseWeekly(period);
    }

    if (granularity === 'monthly') {
        const match = period.match(/^(\d{4})-(\d{2})$/);
        if (!match) {
            return null;
        }

        return new Date(Number(match[1]), Number(match[2]) - 1, 1);
    }

    if (granularity === 'yearly') {
        const match = period.match(/^(\d{4})$/);
        if (!match) {
            return null;
        }

        return new Date(Number(match[1]), 0, 1);
    }

    return null;
}

function periodFor(granularity: string, date: Date): string {
    if (granularity === 'daily') {
        return format(date, 'yyyy-MM-dd');
    }

    if (granularity === 'weekly') {
        const year = format(date, 'RRRR');
        const week = format(date, 'II');

        return `${year}-W${week}`;
    }

    if (granularity === 'monthly') {
        return format(date, 'yyyy-MM');
    }

    return format(date, 'yyyy');
}

function shiftDate(granularity: string, date: Date, direction: -1 | 1): Date {
    if (granularity === 'daily') {
        return addDays(date, direction);
    }

    if (granularity === 'weekly') {
        return addWeeks(date, direction);
    }

    if (granularity === 'monthly') {
        return addMonths(date, direction);
    }

    return addYears(date, direction);
}

export function AppSidebarHeader({
    breadcrumbs = [],
    rightSidebarEnabled = false,
    rightSidebarOpen = false,
    onRightSidebarToggle,
}: {
    breadcrumbs?: BreadcrumbItemType[];
    rightSidebarEnabled?: boolean;
    rightSidebarOpen?: boolean;
    onRightSidebarToggle?: () => void;
}) {
    const pageProps = usePage().props as JournalPageProps;
    const isJournal =
        pageProps.noteType === 'journal' &&
        Boolean(pageProps.journalGranularity) &&
        Boolean(pageProps.journalPeriod);

    const navigateJournal = (direction: -1 | 1) => {
        if (
            !isJournal ||
            !pageProps.journalGranularity ||
            !pageProps.journalPeriod
        ) {
            return;
        }

        const baseDate = parseJournalDate(
            pageProps.journalGranularity,
            pageProps.journalPeriod,
        );
        if (!baseDate) {
            return;
        }

        const nextDate = shiftDate(
            pageProps.journalGranularity,
            baseDate,
            direction,
        );
        const nextPeriod = periodFor(pageProps.journalGranularity, nextDate);

        router.get(
            `/journal/${pageProps.journalGranularity}/${nextPeriod}`,
            {},
            { preserveState: false, preserveScroll: true },
        );
    };

    return (
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border/60 bg-background/90 px-6 backdrop-blur-lg transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 supports-[backdrop-filter]:bg-background/90 md:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <SidebarTrigger className="-ml-1" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>
            <div className="flex items-center gap-2">
                {isJournal && (
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigateJournal(-1)}
                            aria-label="Previous journal note"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => navigateJournal(1)}
                            aria-label="Next journal note"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                {pageProps.noteActions ? (
                    <NoteHeaderActions
                        noteId={pageProps.noteActions.id}
                        title={pageProps.noteActions.title}
                        currentLocation={pageProps.noteActions.parent_path ?? null}
                        currentParentId={pageProps.noteActions.parent_id ?? null}
                        moveParentOptions={pageProps.moveParentOptions ?? []}
                        canMove={Boolean(pageProps.noteActions.canMove)}
                        canRename={Boolean(pageProps.noteActions.canRename)}
                        canDelete={Boolean(pageProps.noteActions.canDelete)}
                        canClear={Boolean(pageProps.noteActions.canClear)}
                        dropdownSide="left"
                    />
                ) : null}
                {rightSidebarEnabled && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={onRightSidebarToggle}
                        aria-label="Toggle right sidebar"
                    >
                        {rightSidebarOpen ? (
                            <PanelRightClose className="h-4 w-4" />
                        ) : (
                            <PanelRightOpen className="h-4 w-4" />
                        )}
                    </Button>
                )}
            </div>
        </header>
    );
}
