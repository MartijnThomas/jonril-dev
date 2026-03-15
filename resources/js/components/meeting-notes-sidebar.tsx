import { Link } from '@inertiajs/react';
import { cn } from '@/lib/utils';
import { format, isValid, parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { X, FileStack, Users } from 'lucide-react';

export type MeetingNote = {
    id: string;
    title: string;
    href: string;
    starts_at?: string | null;
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

export function MeetingNotesSidebar({ meetingNotes, language = 'en', currentNoteId = null, onClose }: MeetingNotesSidebarProps) {
    if (meetingNotes.length === 0) {
        return null;
    }

    return (
        <aside className="flex w-64 shrink-0 flex-col border-l border-sidebar-border/60 bg-sidebar">
            <div className="flex h-12 items-center gap-2 border-b border-sidebar-border/60 px-4">
                <FileStack className="size-4 shrink-0 text-muted-foreground" />
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
                {meetingNotes.map((note) => {
                    const dateLabel = formatMeetingDateTime(note.starts_at, language);
                    return (
                        <li key={note.id}>
                            <Link
                                href={note.href}
                                className={cn(
                                    'flex items-start gap-3 rounded-lg p-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                                    note.id === currentNoteId && 'bg-sidebar-accent text-sidebar-accent-foreground',
                                )}
                            >
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted">
                                    <Users className="size-3 text-muted-foreground" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium leading-snug text-foreground">
                                        {note.title}
                                    </span>
                                    {dateLabel ? (
                                        <span className="block truncate text-[0.72rem] text-muted-foreground leading-snug mt-0.5">
                                            {dateLabel}
                                        </span>
                                    ) : null}
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </aside>
    );
}
