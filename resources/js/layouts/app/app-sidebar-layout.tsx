import { usePage } from '@inertiajs/react';
import { useEffect, useState } from 'react';
import { AppCommandPalette } from '@/components/app-command-palette';
import { AppContent } from '@/components/app-content';
import { AppRightSidebar } from '@/components/app-right-sidebar';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { AppStatusBar } from '@/components/app-status-bar';
import type { AppLayoutProps } from '@/types';

export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
    saveStatus = null,
    rightSidebar,
    statusBarContent,
}: AppLayoutProps) {
    const { rightSidebarOpen: defaultRightSidebarOpen } = usePage().props;
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(
        defaultRightSidebarOpen,
    );

    useEffect(() => {
        setIsRightSidebarOpen(defaultRightSidebarOpen);
    }, [defaultRightSidebarOpen]);

    useEffect(() => {
        document.cookie = `right_sidebar_state=${isRightSidebarOpen}; path=/; max-age=${60 * 60 * 24 * 7}`;
    }, [isRightSidebarOpen]);

    return (
        <AppShell variant="sidebar">
            <AppSidebar />
            <AppContent variant="sidebar" className="overflow-x-hidden">
                <div className="flex min-h-0 flex-1 w-full">
                    <div className="flex min-w-0 flex-1 flex-col">
                        <AppSidebarHeader
                            breadcrumbs={breadcrumbs}
                            rightSidebarEnabled
                            rightSidebarOpen={isRightSidebarOpen}
                            onRightSidebarToggle={() =>
                                setIsRightSidebarOpen((open) => !open)
                            }
                        />
                        <div className="min-h-0 flex-1">{children}</div>
                        <AppStatusBar saveStatus={saveStatus}>
                            {statusBarContent}
                        </AppStatusBar>
                    </div>
                </div>
            </AppContent>
            <AppRightSidebar open={isRightSidebarOpen}>
                {rightSidebar}
            </AppRightSidebar>
            <AppCommandPalette />
        </AppShell>
    );
}
