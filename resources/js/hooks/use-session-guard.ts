import { router } from '@inertiajs/react';
import { useEffect, useRef, useState } from 'react';
import type { EditorVersion } from '@/contexts/editor-version-context';

// Only run checks if the tab was hidden for longer than this.
const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function useSessionGuard(editorVersion: EditorVersion): { isChecking: boolean } {
    const [isChecking, setIsChecking] = useState(false);
    const hiddenAtRef = useRef<number | null>(null);
    const editorVersionRef = useRef(editorVersion);
    const checkInFlightRef = useRef(false);

    useEffect(() => {
        editorVersionRef.current = editorVersion;
    }, [editorVersion]);

    useEffect(() => {
        const runSessionAndContentCheck = async (force = false) => {
            if (checkInFlightRef.current) {
                return;
            }

            if (!force) {
                const hiddenAt = hiddenAtRef.current;
                hiddenAtRef.current = null;

                if (hiddenAt === null || Date.now() - hiddenAt < IDLE_THRESHOLD_MS) {
                    return;
                }
            }

            checkInFlightRef.current = true;
            if (document.visibilityState === 'hidden') {
                checkInFlightRef.current = false;
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
                checkInFlightRef.current = false;
                setIsChecking(false);
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAtRef.current = Date.now();
                return;
            }

            void runSessionAndContentCheck(false);
        };

        const handlePopState = () => {
            void runSessionAndContentCheck(true);
        };

        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                void runSessionAndContentCheck(true);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('popstate', handlePopState);
        window.addEventListener('pageshow', handlePageShow);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('popstate', handlePopState);
            window.removeEventListener('pageshow', handlePageShow);
        };
    }, []);

    return { isChecking };
}
