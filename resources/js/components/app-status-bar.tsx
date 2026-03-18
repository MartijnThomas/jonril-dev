import type { ReactNode } from 'react';
import type { EditorSaveStatus } from '@/types';

export function AppStatusBar({
    children,
}: {
    saveStatus?: EditorSaveStatus | null;
    lastSavedAt?: number | null;
    children?: ReactNode;
}) {
    return (
        <footer className="sticky bottom-0 z-30 hidden overflow-x-hidden border-t border-sidebar-border/50 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur supports-backdrop-filter:bg-background/85 md:block">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 overflow-hidden">{children}</div>
            </div>
        </footer>
    );
}
