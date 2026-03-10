import { usePage } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import { AppCommandPalette } from '@/components/app-command-palette';
import { AppContent } from '@/components/app-content';
import { AppRightSidebar } from '@/components/app-right-sidebar';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { AppStatusBar } from '@/components/app-status-bar';
import { useSidebar } from '@/components/ui/sidebar';
import type { AppLayoutProps } from '@/types';

const EDITOR_MIN_WIDTH = 760;
const LEFT_SIDEBAR_OPEN_WIDTH = 256;
const LEFT_SIDEBAR_COLLAPSED_WIDTH = 48;
const RIGHT_SIDEBAR_OPEN_WIDTH = 320;
const CONTENT_HORIZONTAL_BUFFER = 32;
const VIEWPORT_SHRINK_THRESHOLD = 24;

function ResponsiveSidebarManager({
    rightSidebarOpen,
    setRightSidebarOpen,
}: {
    rightSidebarOpen: boolean;
    setRightSidebarOpen: (value: boolean) => void;
}) {
    const { open: leftSidebarOpen, setOpen: setLeftSidebarOpen } = useSidebar();
    const leftOpenRef = useRef(leftSidebarOpen);
    const rightOpenRef = useRef(rightSidebarOpen);
    const lastViewportWidthRef = useRef<number | null>(null);
    const setLeftSidebarOpenRef = useRef(setLeftSidebarOpen);
    const setRightSidebarOpenRef = useRef(setRightSidebarOpen);

    useEffect(() => {
        leftOpenRef.current = leftSidebarOpen;
        rightOpenRef.current = rightSidebarOpen;
    }, [leftSidebarOpen, rightSidebarOpen]);

    useEffect(() => {
        setLeftSidebarOpenRef.current = setLeftSidebarOpen;
        setRightSidebarOpenRef.current = setRightSidebarOpen;
    }, [setLeftSidebarOpen, setRightSidebarOpen]);

    useEffect(() => {
        const enforceEditorMinWidth = (onlyOnShrink: boolean) => {
            if (window.innerWidth < 768) {
                lastViewportWidthRef.current = window.innerWidth;
                return;
            }

            const currentWidth = window.innerWidth;
            const previousWidth = lastViewportWidthRef.current;
            lastViewportWidthRef.current = currentWidth;

            if (
                onlyOnShrink &&
                previousWidth !== null &&
                previousWidth - currentWidth < VIEWPORT_SHRINK_THRESHOLD
            ) {
                return;
            }

            const leftWidth = leftOpenRef.current
                ? LEFT_SIDEBAR_OPEN_WIDTH
                : LEFT_SIDEBAR_COLLAPSED_WIDTH;
            const rightWidth = rightOpenRef.current ? RIGHT_SIDEBAR_OPEN_WIDTH : 0;
            const availableEditorWidth =
                currentWidth - leftWidth - rightWidth - CONTENT_HORIZONTAL_BUFFER;

            if (availableEditorWidth >= EDITOR_MIN_WIDTH) {
                return;
            }

            if (leftOpenRef.current) {
                setLeftSidebarOpenRef.current(false);
                return;
            }

            if (rightOpenRef.current) {
                setRightSidebarOpenRef.current(false);
            }
        };

        enforceEditorMinWidth(false);

        const handleResize = () => enforceEditorMinWidth(true);
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return null;
}

export default function AppSidebarLayout({
    children,
    breadcrumbs = [],
    saveStatus = null,
    saveLastSavedAt = null,
    rightSidebar,
    statusBarContent,
    bottomPane,
}: AppLayoutProps) {
    const { rightSidebarOpen: defaultRightSidebarOpen } = usePage().props;
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(() => {
        if (typeof document !== 'undefined') {
            const value = document.cookie
                .split('; ')
                .find((part) => part.startsWith('right_sidebar_state='))
                ?.split('=')[1];

            if (value === 'true') return true;
            if (value === 'false') return false;
        }

        return defaultRightSidebarOpen;
    });

    useEffect(() => {
        document.cookie = `right_sidebar_state=${isRightSidebarOpen}; path=/; max-age=${60 * 60 * 24 * 7}`;
    }, [isRightSidebarOpen]);

    return (
        <AppShell variant="sidebar">
            <ResponsiveSidebarManager
                rightSidebarOpen={isRightSidebarOpen}
                setRightSidebarOpen={setIsRightSidebarOpen}
            />
            <AppSidebar />
            <AppContent variant="sidebar" className="overflow-x-clip">
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
                        {bottomPane}
                        <AppStatusBar
                            saveStatus={saveStatus}
                            lastSavedAt={saveLastSavedAt}
                        >
                            {statusBarContent}
                        </AppStatusBar>
                    </div>
                </div>
            </AppContent>
            <AppRightSidebar
                open={isRightSidebarOpen}
                onClose={() => setIsRightSidebarOpen(false)}
            >
                {rightSidebar}
            </AppRightSidebar>
            <AppCommandPalette />
        </AppShell>
    );
}
