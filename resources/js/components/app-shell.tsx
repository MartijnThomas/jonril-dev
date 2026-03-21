import { usePage } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { EditorVersion } from '@/contexts/editor-version-context';
import { EditorVersionContext } from '@/contexts/editor-version-context';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSessionGuard } from '@/hooks/use-session-guard';

type Props = {
    children: ReactNode;
    variant?: 'header' | 'sidebar';
};

function SessionCheckOverlay() {
    return (
        <div className="fixed inset-0 z-200 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Checking session…</p>
            </div>
        </div>
    );
}

export function AppShell({ children, variant = 'header' }: Props) {
    const [editorVersion, setEditorVersion] = useState<EditorVersion>(null);
    const { isChecking } = useSessionGuard(editorVersion);
    const isMobile = useIsMobile();
    const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);
    const isOpen = usePage().props.sidebarOpen;
    const cookieOpen = useMemo(() => {
        if (typeof document === 'undefined') {
            return null;
        }

        const value = document.cookie
            .split('; ')
            .find((part) => part.startsWith('sidebar_state='))
            ?.split('=')[1];

        if (value === 'true') return true;
        if (value === 'false') return false;

        return null;
    }, []);
    const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(
        isMobile ? false : (cookieOpen ?? isOpen),
    );

    useEffect(() => {
        if (!isMobile) {
            return;
        }

        const updateViewportHeight = () => {
            const viewport = window.visualViewport;
            if (!viewport) {
                setMobileViewportHeight(window.innerHeight);
                return;
            }

            setMobileViewportHeight(Math.round(viewport.height));
        };

        updateViewportHeight();
        window.visualViewport?.addEventListener('resize', updateViewportHeight);
        window.visualViewport?.addEventListener('scroll', updateViewportHeight);
        window.addEventListener('orientationchange', updateViewportHeight);

        return () => {
            window.visualViewport?.removeEventListener('resize', updateViewportHeight);
            window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
            window.removeEventListener('orientationchange', updateViewportHeight);
        };
    }, [isMobile]);

    useEffect(() => {
        if (variant !== 'sidebar') {
            return;
        }

        const html = document.documentElement;
        const body = document.body;
        const previousHtmlOverflow = html.style.overflow;
        const previousBodyOverflow = body.style.overflow;
        const previousBodyOverscroll = body.style.overscrollBehaviorY;

        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.overscrollBehaviorY = 'none';

        return () => {
            html.style.overflow = previousHtmlOverflow;
            body.style.overflow = previousBodyOverflow;
            body.style.overscrollBehaviorY = previousBodyOverscroll;
        };
    }, [variant]);

    if (variant === 'header') {
        return (
            <EditorVersionContext.Provider value={{ version: editorVersion, setVersion: setEditorVersion }}>
                {isChecking && <SessionCheckOverlay />}
                <div className="flex min-h-screen w-full flex-col">{children}</div>
            </EditorVersionContext.Provider>
        );
    }

    return (
        <EditorVersionContext.Provider value={{ version: editorVersion, setVersion: setEditorVersion }}>
            {isChecking && <SessionCheckOverlay />}
            <SidebarProvider
                className="overflow-hidden"
                style={{ height: mobileViewportHeight ? `${mobileViewportHeight}px` : '100dvh' }}
                open={leftSidebarOpen}
                onOpenChange={setLeftSidebarOpen}
            >
                {children}
            </SidebarProvider>
        </EditorVersionContext.Provider>
    );
}
