import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import type { EditorVersion } from '@/contexts/editor-version-context';

// Only run checks if the tab was hidden for longer than this.
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function useSessionGuard(editorVersion: EditorVersion): { isChecking: boolean } {
    const [isChecking, setIsChecking] = useState(false);
    const hiddenAtRef = useRef<number | null>(null);
    const editorVersionRef = useRef(editorVersion);

    useEffect(() => {
        editorVersionRef.current = editorVersion;
    }, [editorVersion]);

    useEffect(() => {
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }

            const hiddenAt = hiddenAtRef.current;
            hiddenAtRef.current = null;

            if (hiddenAt === null || Date.now() - hiddenAt < IDLE_THRESHOLD_MS) {
                return;
            }

            setIsChecking(true);

            try {
                // Step 1: verify session and CSRF token are still valid.
                const pingResponse = await fetch('/ping', {
                    method: 'GET',
                    credentials: 'same-origin',
                    headers: { 'X-Requested-With': 'XMLHttpRequest' },
                });

                if (pingResponse.status === 401 || pingResponse.status === 419) {
                    window.location.reload();
                    return;
                }

                // Step 2: verify the note content has not changed on the server.
                const version = editorVersionRef.current;
                if (version?.hashUrl && version?.contentHash) {
                    const hashResponse = await fetch(version.hashUrl, {
                        credentials: 'same-origin',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' },
                    });

                    if (hashResponse.ok) {
                        const { hash } = await hashResponse.json() as { hash: string };
                        if (hash !== version.contentHash) {
                            router.reload();
                            return;
                        }
                    }
                }
            } catch {
                // Network error — don't block the user, let them retry naturally.
            } finally {
                setIsChecking(false);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    return { isChecking };
}
