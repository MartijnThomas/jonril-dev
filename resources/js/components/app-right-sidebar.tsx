import type { ReactNode } from 'react';
import { RightSidebarCalendar } from '@/components/right-sidebar-calendar';
import { cn } from '@/lib/utils';

type AppRightSidebarProps = {
    open: boolean;
    children?: ReactNode;
};

export function AppRightSidebar({ open, children }: AppRightSidebarProps) {
    return (
        <div
            className="group/right-sidebar text-sidebar-foreground hidden md:block"
            data-open={open}
        >
            <div
                className={cn(
                    'relative h-svh w-80 bg-transparent transition-[width] duration-200 ease-linear',
                    !open && 'w-0',
                )}
            />

            <aside
                className={cn(
                    'fixed inset-y-0 right-0 z-10 hidden h-svh w-80 p-2 transition-[right,width] duration-200 ease-linear md:flex',
                    !open && 'w-0 translate-x-full p-0',
                )}
                aria-hidden={!open}
            >
                <div
                    className={cn(
                        'bg-sidebar flex h-full w-full flex-col rounded-xl',
                        !open && 'pointer-events-none opacity-0',
                    )}
                >
                    <div className="h-full min-w-0 overflow-y-auto">
                        <div className="space-y-4">
                            <RightSidebarCalendar />
                            {children ? (
                                <section className="rounded-lg border border-sidebar-border/50 bg-background/80 p-3">
                                    {children}
                                </section>
                            ) : null}
                        </div>
                    </div>
                </div>
            </aside>
        </div>
    );
}
