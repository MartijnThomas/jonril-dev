import type { ReactNode } from 'react';
import { RightSidebarCalendar } from '@/components/right-sidebar-calendar';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type AppRightSidebarProps = {
    open: boolean;
    onClose?: () => void;
    children?: ReactNode;
};

export function AppRightSidebar({
    open,
    children,
}: AppRightSidebarProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <aside
                className={cn(
                    'fixed inset-y-0 right-0 z-30 w-[18rem] bg-sidebar p-0 text-sidebar-foreground transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] md:hidden',
                    open ? 'translate-x-0' : 'translate-x-full',
                )}
                aria-hidden={!open}
            >
                <div className="flex h-full min-h-0 w-full flex-col">
                    <div className="flex h-full min-h-0 min-w-0 flex-col">
                        <div className="flex h-full min-h-0 flex-col space-y-4 md:pr-2">
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
        );
    }

    return (
        <div
            className="group/right-sidebar text-sidebar-foreground"
            data-open={open}
        >
            <div
                className={cn(
                    'relative hidden h-svh w-80 bg-transparent transition-[width] duration-200 ease-linear md:block',
                    !open && 'w-0',
                )}
            />

            <aside
                className={cn(
                    'fixed inset-y-0 right-0 z-10 hidden h-svh w-80 p-0 pr-4 transition-[right,width] duration-200 ease-linear md:flex',
                    !open && 'w-0 translate-x-full p-0',
                )}
                aria-hidden={!open}
            >
                <div
                    className={cn(
                        'flex h-full min-h-0 w-full flex-col rounded-xl bg-sidebar',
                        !open && 'pointer-events-none opacity-0',
                    )}
                >
                    <div className="flex h-full min-h-0 min-w-0 flex-col">
                        <div className="flex h-full min-h-0 flex-col space-y-4">
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
