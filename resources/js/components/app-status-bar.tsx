import type { ReactNode } from 'react';
import type { EditorSaveStatus } from '@/types';

const saveStatusLabel: Record<EditorSaveStatus, string> = {
    ready: 'Ready',
    dirty: 'Dirty',
    saving: 'Saving...',
    error: 'Save error',
};

export function AppStatusBar({
    saveStatus = null,
    children,
}: {
    saveStatus?: EditorSaveStatus | null;
    children?: ReactNode;
}) {
    return (
        <footer className="sticky bottom-0 z-30 border-t border-sidebar-border/50 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate">{children}</div>
                <div className="shrink-0">
                    {saveStatus ? saveStatusLabel[saveStatus] : ''}
                </div>
            </div>
        </footer>
    );
}
