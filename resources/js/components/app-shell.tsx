import { usePage } from '@inertiajs/react';
import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
            <SidebarProvider className="h-svh overflow-hidden" open={leftSidebarOpen} onOpenChange={setLeftSidebarOpen}>
                {children}
            </SidebarProvider>
        </EditorVersionContext.Provider>
    );
}
