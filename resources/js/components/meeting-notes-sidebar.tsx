import { Link } from '@inertiajs/react';
import { cn } from '@/lib/utils';
import { format, isValid, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { X, CalendarDays } from 'lucide-react';
import { TASK_STATUS_ICONS, TASK_STATUS_ORDER } from '@/lib/task-status-icons';

export type TaskCounts = {
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
};

export type MeetingNote = {
    id: string;
    title: string;
    href: string;
    starts_at?: string | null;
    event_deleted?: boolean;
    task_counts?: TaskCounts | null;
};

type MeetingNotesSidebarProps = {
    meetingNotes: MeetingNote[];
    language?: 'nl' | 'en';
    currentNoteId?: string | null;
    onClose?: () => void;
};

function formatMeetingDateTime(startsAt: string | null | undefined, language: 'nl' | 'en'): string | null {
    if (!startsAt) return null;
    const date = parseISO(startsAt);
    if (!isValid(date)) return null;
    const locale = language === 'nl' ? nl : enUS;
    return format(date, 'd MMM · HH:mm', { locale });
}

function TaskCountBadges({ counts }: { counts: TaskCounts | null | undefined }) {
    if (!counts) return null;

    const visible = TASK_STATUS_ORDER.filter((status) => (counts[status] ?? 0) > 0);
    if (visible.length === 0) return null;

    return (
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {visible.map((status) => {
                const { icon: Icon, label } = TASK_STATUS_ICONS[status];
                return (
                    <span key={status} className="flex items-center gap-0.5 text-muted-foreground/70">
                        <Icon className="size-3 shrink-0" aria-hidden="true" />
                        <span className="text-[0.68rem] leading-none tabular-nums">{counts[status]}</span>
                        <span className="sr-only">{label}</span>
                    </span>
                );
            })}
        </span>
    );
}

function MeetingNoteItem({ note, language, currentNoteId }: { note: MeetingNote; language: 'nl' | 'en'; currentNoteId: string | null }) {
    const dateLabel = formatMeetingDateTime(note.starts_at, language);
    const isDeleted = note.event_deleted === true;

    return (
        <li>
            <Link
                href={note.href}
                className={cn(
                    'flex items-start gap-3 rounded-lg p-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    note.id === currentNoteId && 'bg-sidebar-accent text-sidebar-accent-foreground',
                    isDeleted && 'opacity-60',
                )}
            >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
                    <CalendarDays className="size-3 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                    {dateLabel ? (
                        <span className="block truncate text-[0.72rem] text-muted-foreground leading-snug">
                            {dateLabel}
                        </span>
                    ) : null}
                    <span className="flex items-center gap-1.5">
                        <span className={cn(
                            'min-w-0 truncate font-medium leading-snug text-foreground',
                            isDeleted && 'line-through decoration-muted-foreground/60',
                        )}>
                            {note.title}
                        </span>
                        {isDeleted && (
                            <span className="shrink-0 rounded px-1 py-px text-[0.62rem] font-medium uppercase tracking-wide bg-destructive/10 text-destructive">
                                Deleted
                            </span>
                        )}
                    </span>
                    <TaskCountBadges counts={note.task_counts} />
                </span>
            </Link>
        </li>
    );
}

export function MeetingNotesSidebar({ meetingNotes, language = 'en', currentNoteId = null, onClose }: MeetingNotesSidebarProps) {
    if (meetingNotes.length === 0) {
        return null;
    }

    return (
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-l border-sidebar-border/60 bg-sidebar">
            <div className="flex h-12 items-center gap-2 border-b border-sidebar-border/60 px-4">
                <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">Meetings</span>
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[0.68rem] font-medium text-muted-foreground">
                    {meetingNotes.length}
                </span>
                {onClose ? (
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Hide meetings"
                    >
                        <X className="size-4" />
                    </button>
                ) : null}
            </div>

            <ul className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {meetingNotes.map((note) => (
                    <MeetingNoteItem key={note.id} note={note} language={language} currentNoteId={currentNoteId} />
                ))}
            </ul>
        </aside>
    );
}
