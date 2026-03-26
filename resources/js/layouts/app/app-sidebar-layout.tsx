import { usePage } from '@inertiajs/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AppCommandPalette } from '@/components/app-command-palette';
import { AppContent } from '@/components/app-content';
import { AppFab } from '@/components/app-fab';
import { AppRightSidebar } from '@/components/app-right-sidebar';
import { AppShell } from '@/components/app-shell';
import { AppSidebar } from '@/components/app-sidebar';
import { AppSidebarHeader } from '@/components/app-sidebar-header';
import { AppStatusBar } from '@/components/app-status-bar';
import { useSidebar } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import type { AppLayoutProps } from '@/types';

const EDITOR_MIN_WIDTH = 760;
const LEFT_SIDEBAR_OPEN_WIDTH = 256;
const LEFT_SIDEBAR_COLLAPSED_WIDTH = 48;
const RIGHT_SIDEBAR_OPEN_WIDTH = 320;
const CONTENT_HORIZONTAL_BUFFER = 32;
const VIEWPORT_SHRINK_THRESHOLD = 24;

const edgeTabClass =
    'absolute top-1/2 z-20 flex -translate-y-1/2 items-center justify-center rounded-sm border border-sidebar-border/60 bg-sidebar/60 text-muted-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-12 w-5 md:h-11 md:w-4';

function LeftSidebarEdgeToggle() {
    const { state, toggleSidebar, isMobile, openMobile } = useSidebar();
    const isCollapsed = isMobile ? !openMobile : state === 'collapsed';
    return (
        <button
            type="button"
            onClick={toggleSidebar}
            className={`${edgeTabClass} left-0 rounded-l-none border-l-0`}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
            {isCollapsed ? <ChevronRight className="size-4 md:size-3.5" /> : <ChevronLeft className="size-4 md:size-3.5" />}
        </button>
    );
}

function RightSidebarEdgeToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`${edgeTabClass} right-0 rounded-r-none border-r-0`}
            aria-label={open ? 'Close right sidebar' : 'Open right sidebar'}
        >
            {open ? <ChevronRight className="size-4 md:size-3.5" /> : <ChevronLeft className="size-4 md:size-3.5" />}
        </button>
    );
}

function MobileSidebarInteractionShield({
    isMobile,
    isRightSidebarOpen,
}: {
    isMobile: boolean;
    isRightSidebarOpen: boolean;
}) {
    const { openMobile: isLeftSidebarOpenMobile } = useSidebar();
    const isVisible = isMobile && (isLeftSidebarOpenMobile || isRightSidebarOpen);

    if (!isVisible) {
        return null;
    }

    return <div aria-hidden="true" className="absolute inset-0 z-20 bg-transparent md:hidden" />;
}

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
    const isMobile = useIsMobile();
    const shouldRenderStatusBar =
        statusBarContent !== undefined ||
        saveStatus !== null ||
        saveLastSavedAt !== null;
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState<boolean>(() => {
        if (isMobile) {
            return false;
        }

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
    const [isEditorFocused, setIsEditorFocused] = useState(false);

    useEffect(() => {
        document.cookie = `right_sidebar_state=${isRightSidebarOpen}; path=/; max-age=${60 * 60 * 24 * 7}`;
    }, [isRightSidebarOpen]);

    useEffect(() => {
        const handleEditorFocusState = (event: Event) => {
            const customEvent = event as CustomEvent<{ active?: boolean }>;
            setIsEditorFocused(customEvent.detail?.active === true);
        };

        window.addEventListener('editor-focus-state', handleEditorFocusState as EventListener);

        return () => {
            window.removeEventListener('editor-focus-state', handleEditorFocusState as EventListener);
        };
    }, []);

    return (
        <AppShell
            variant="sidebar"
            rightSidebarOpen={isRightSidebarOpen}
            onRightSidebarOpenChange={setIsRightSidebarOpen}
        >
            <ResponsiveSidebarManager
                rightSidebarOpen={isRightSidebarOpen}
                setRightSidebarOpen={setIsRightSidebarOpen}
            />
            <AppSidebar />
            <AppContent variant="sidebar" className="h-full min-h-0 overflow-hidden">
                <MobileSidebarInteractionShield
                    isMobile={isMobile}
                    isRightSidebarOpen={isRightSidebarOpen}
                />
                <LeftSidebarEdgeToggle />
                <RightSidebarEdgeToggle
                    open={isRightSidebarOpen}
                    onToggle={() => setIsRightSidebarOpen((open) => !open)}
                />
                <div className="flex min-h-0 min-w-0 flex-1 w-full overflow-hidden">
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                        <AppSidebarHeader
                            breadcrumbs={breadcrumbs}
                            saveStatus={saveStatus}
                        />
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                            {children}
                            {bottomPane}
                        </div>
                        {shouldRenderStatusBar ? (
                            <AppStatusBar
                                saveStatus={saveStatus}
                                lastSavedAt={saveLastSavedAt}
                            >
                                {statusBarContent}
                            </AppStatusBar>
                        ) : null}
                    </div>
                </div>
            </AppContent>
            <AppRightSidebar
                open={isRightSidebarOpen}
                onClose={() => setIsRightSidebarOpen(false)}
            >
                {rightSidebar}
            </AppRightSidebar>
            <AppFab className={isEditorFocused ? 'pointer-events-none opacity-0' : undefined} />
            <AppCommandPalette />
        </AppShell>
    );
}
