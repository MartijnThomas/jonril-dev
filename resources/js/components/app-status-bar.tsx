import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { EditorSaveStatus } from '@/types';

function formatElapsed(seconds: number): string {
    if (seconds < 10) {
        return 'Saved just now';
    }

    if (seconds < 60) {
        return 'Saved less than a minute ago';
    }

    const minutes = Math.floor(seconds / 60);
    if (minutes === 1) {
        return 'Saved 1 minute ago';
    }

    if (minutes < 60) {
        return `Saved ${minutes} minutes ago`;
    }

    const hours = Math.floor(minutes / 60);
    if (hours === 1) {
        return 'Saved 1 hour ago';
    }

    return `Saved ${hours} hours ago`;
}

export function AppStatusBar({
    saveStatus = null,
    lastSavedAt = null,
    children,
}: {
    saveStatus?: EditorSaveStatus | null;
    lastSavedAt?: number | null;
    children?: ReactNode;
}) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!lastSavedAt || saveStatus !== 'ready') {
            return;
        }

        const timer = window.setInterval(() => {
            setNow(Date.now());
        }, 10000);

        return () => {
            window.clearInterval(timer);
        };
    }, [lastSavedAt, saveStatus]);

    const saveStatusLabel = useMemo(() => {
        if (!saveStatus) {
            return '';
        }

        if (saveStatus === 'dirty') {
            return 'Untracked changes';
        }

        if (saveStatus === 'saving') {
            return 'Saving...';
        }

        if (saveStatus === 'error') {
            return 'Save error';
        }

        if (!lastSavedAt) {
            return 'Ready';
        }

        const elapsedSeconds = Math.max(
            0,
            Math.floor((now - lastSavedAt) / 1000),
        );

        return formatElapsed(elapsedSeconds);
    }, [lastSavedAt, now, saveStatus]);

    return (
        <footer className="sticky bottom-0 z-30 hidden border-t border-sidebar-border/50 bg-background/95 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/85 md:block">
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 truncate">{children}</div>
                <div className="shrink-0">{saveStatusLabel}</div>
            </div>
        </footer>
    );
}
