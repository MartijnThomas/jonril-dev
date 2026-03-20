import { Link, usePage } from '@inertiajs/react';
import { format } from 'date-fns';
import { Calendar, CalendarDays } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getLucideIconComponent } from '@/components/icon-picker';
import { cn } from '@/lib/utils';

function DailyCalendarBadge({ className, dayNumber }: { className?: string; dayNumber: string }) {
    return (
        <span className={cn('relative inline-flex items-center justify-center', className)}>
            <Calendar className="size-6" />
            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[10px] leading-none font-semibold">
                {dayNumber}
            </span>
        </span>
    );
}

export function AppFab({ className }: { className?: string }) {
    const page = usePage();
    const pageProps = page.props as {
        auth?: {
            user?: {
                settings?: {
                    editor?: {
                        journal_icons?: { daily?: string };
                    };
                };
            };
        };
    };

    const today = format(new Date(), 'yyyy-MM-dd');
    const dayNumber = format(new Date(), 'd');

    const dailyNoteHref = `/journal/${today}`;

    const dailyIconName = pageProps.auth?.user?.settings?.editor?.journal_icons?.daily ?? null;

    const isDefaultIcon =
        !dailyIconName || dailyIconName === 'calendar' || dailyIconName === 'calendar_days';

    let IconComponent: LucideIcon | null = null;
    if (!isDefaultIcon) {
        IconComponent = getLucideIconComponent(dailyIconName, CalendarDays) as LucideIcon;
    }

    return (
        <div className={cn('fixed right-5 bottom-5 z-50 flex flex-col-reverse items-end gap-3', className)}>
            <Link
                href={dailyNoteHref}
                className="flex size-14 items-center justify-center rounded-full bg-primary/70 text-primary-foreground shadow-lg backdrop-blur-sm transition-[transform,background-color] hover:scale-105 hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="Go to today's daily note"
            >
                {isDefaultIcon ? (
                    <DailyCalendarBadge dayNumber={dayNumber} />
                ) : (
                    IconComponent && <IconComponent className="size-6" />
                )}
            </Link>
        </div>
    );
}
