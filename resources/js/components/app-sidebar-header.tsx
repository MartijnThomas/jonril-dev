import { Link, router, usePage } from '@inertiajs/react';
import { addDays, addMonths, addWeeks, addYears, format } from 'date-fns';
import {
    AlertCircle,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    LoaderCircle,
    Search,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { NoteHeaderActions } from '@/components/note-header-actions';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import type { BreadcrumbItem as BreadcrumbItemType, EditorSaveStatus } from '@/types';

function SaveStatusIcon({ status }: { status: EditorSaveStatus | null }) {
    const [showSaved, setShowSaved] = useState(false);
    const prevStatusRef = useRef<EditorSaveStatus | null>(null);

    useEffect(() => {
        if (prevStatusRef.current === 'saving' && status === 'ready') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setShowSaved(true);
            const t = setTimeout(() => setShowSaved(false), 2000);
            return () => clearTimeout(t);
        }
        prevStatusRef.current = status;
    }, [status]);

    if (status === 'saving') {
        return <LoaderCircle className="size-4.5 animate-spin text-muted-foreground" aria-label="Saving" />;
    }
    if (status === 'error') {
        return <AlertCircle className="size-4.5 text-destructive" aria-label="Save failed" />;
    }
    if (status === 'dirty') {
        return <span className="flex size-4.5 items-center justify-center" aria-label="Unsaved changes"><span className="size-2 rounded-full bg-amber-400" /></span>;
    }
    if (showSaved) {
        return <CheckCircle className="size-4.5 text-emerald-500" aria-label="Saved" />;
    }
    return null;
}

function MobileNotePath({ breadcrumbs }: { breadcrumbs: BreadcrumbItemType[] }) {
    const parents = breadcrumbs.slice(0, -1);
    if (parents.length === 0) return null;
    return (
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground md:text-[0.68rem]">
                {parents.map((item, i) => (
                    <span key={i} className="flex items-center gap-1">
                        {i > 0 && <span className="opacity-40">/</span>}
                        <Link href={item.href} className="hover:text-foreground transition-colors">
                            {item.title}
                        </Link>
                    </span>
                ))}
            </span>
        </div>
    );
}

function buildNoteKanbanUrl(noteId: string): string {
    const params = new URLSearchParams();
    params.append('note_scope_ids[]', noteId);
    for (const status of [
        'open',
        'backlog',
        'in_progress',
        'starred',
        'assigned',
        'migrated',
        'canceled',
        'completed',
    ]) {
        params.append('status[]', status);
    }

    return `/tasks/kanban?${params.toString()}`;
}

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
        canAttachToEvent?: boolean;
        canDetachFromEvent?: boolean;
        canOpenBlockPreview?: boolean;
        blockPreviewUrl?: string | null;
        historyUrl?: string | null;
    } | null;
    moveParentOptions?: Array<{ id: string; title: string; path: string }>;
    currentWorkspace?: {
        slug?: string | null;
    };
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

export function AppSidebarHeader({
    breadcrumbs = [],
    saveStatus = null,
}: {
    breadcrumbs?: BreadcrumbItemType[];
    saveStatus?: EditorSaveStatus | null;
}) {
    const isMobile = useIsMobile();
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
        if (!isValidJournalPeriod(pageProps.journalGranularity, nextPeriod)) {
            return;
        }

        const path = `/journal/${nextPeriod}`;

        router.get(path, {}, { preserveState: false, preserveScroll: true });
    };

    const mobileTitle = breadcrumbs.at(-1)?.title ?? '';
    const showMobilePath = isMobile && breadcrumbs.length > 1;
    const headerIconClassName = 'size-5 md:size-[18px]';
    const openCommandPalette = () => {
        window.dispatchEvent(new Event('open-command-palette'));
    };

    return (
        <div className="z-20 shrink-0">
            <header className="flex shrink-0 items-center gap-2 border-b border-sidebar-border/60 bg-background/90 px-6 py-3 backdrop-blur-lg transition-[width,height] ease-linear supports-backdrop-filter:bg-background/90 md:h-16 md:py-0 md:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    {isMobile ? (
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-base leading-tight font-medium text-foreground md:text-sm">{mobileTitle}</span>
                            {showMobilePath && <MobileNotePath breadcrumbs={breadcrumbs} />}
                        </div>
                    ) : (
                        <Breadcrumbs breadcrumbs={breadcrumbs} />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <SaveStatusIcon status={saveStatus} />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 px-2 text-sm text-muted-foreground md:h-7 md:text-xs"
                        onClick={openCommandPalette}
                        aria-label="Open command palette"
                    >
                        <Search className="size-4 md:size-3.5" />
                        <span className="hidden sm:inline">Search</span>
                        <span className="hidden lg:inline text-[10px] text-muted-foreground/80">⌘K</span>
                    </Button>
                    {isJournal && (
                        <div className="flex items-center gap-1">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 md:h-7 md:w-7"
                                onClick={() => navigateJournal(-1)}
                                aria-label="Previous journal note"
                            >
                                <ChevronLeft className={headerIconClassName} />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 md:h-7 md:w-7"
                                onClick={() => navigateJournal(1)}
                                aria-label="Next journal note"
                            >
                                <ChevronRight className={headerIconClassName} />
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
                            canAttachToEvent={Boolean(pageProps.noteActions.canAttachToEvent)}
                            canDetachFromEvent={Boolean(pageProps.noteActions.canDetachFromEvent)}
                            canOpenBlockPreview={Boolean(
                                pageProps.noteActions.canOpenBlockPreview,
                            )}
                            blockPreviewUrl={
                                pageProps.noteActions.blockPreviewUrl ?? null
                            }
                            historyUrl={pageProps.noteActions.historyUrl ?? null}
                            kanbanUrl={buildNoteKanbanUrl(pageProps.noteActions.id)}
                            dropdownSide="left"
                            enablePropertiesToggle
                            triggerIconClassName={headerIconClassName}
                        />
                    ) : null}
                </div>
            </header>
        </div>
    );
}
