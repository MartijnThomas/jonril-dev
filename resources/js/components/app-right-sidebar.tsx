import type { ReactNode } from 'react';
import { RightSidebarCalendar } from '@/components/right-sidebar-calendar';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

type AppRightSidebarProps = {
    open: boolean;
    onClose?: () => void;
    children?: ReactNode;
};

export function AppRightSidebar({
    open,
    onClose,
    children,
}: AppRightSidebarProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <Sheet
                open={open}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) {
                        onClose?.();
                    }
                }}
            >
                <SheetHeader className="sr-only">
                    <SheetTitle>Right sidebar</SheetTitle>
                    <SheetDescription>
                        Displays the right sidebar.
                    </SheetDescription>
                </SheetHeader>
                <SheetContent
                    side="right"
                    overlayClassName="bg-black/20"
                    className="bg-sidebar text-sidebar-foreground w-[18rem] p-0 [&>button]:hidden"
                >
                    <div className="flex h-full w-full flex-col">
                        <div className="h-full min-w-0 overflow-y-auto">
                            <div className="space-y-4 md:pr-2">
                                <RightSidebarCalendar />
                                {children ? (
                                    <section className="rounded-lg border border-sidebar-border/50 bg-background/80 p-3">
                                        {children}
                                    </section>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <div className="group/right-sidebar text-sidebar-foreground" data-open={open}>
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
