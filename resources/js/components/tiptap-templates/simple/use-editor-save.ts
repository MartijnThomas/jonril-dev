import { router } from '@inertiajs/react';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ICON_BG_PROPERTY_KEY,
    ICON_COLOR_PROPERTY_KEY,
    sanitizeIconStyleToken,
} from '@/lib/icon-style';
import type { EditorSaveStatus } from '@/types';

export type DocumentPropertiesValue = Record<string, string>;

type UseEditorSaveProps = {
    editor: Editor | null;
    noteId: string;
    noteUpdateUrl: string;
    enabled?: boolean;
    properties?: DocumentPropertiesValue;
    idleMs?: number;
    includeTimeblocks?: boolean;
    saveTransport?: 'auto' | 'json' | 'inertia';
};

function getCookie(name: string): string | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const match = document.cookie
        .split('; ')
        .find((part) => part.startsWith(`${name}=`));

    if (!match) {
        return null;
    }

    return decodeURIComponent(match.split('=').slice(1).join('='));
}

function sanitizeProperties(
    properties: DocumentPropertiesValue,
): DocumentPropertiesValue {
    const next = { ...properties };

    const iconColor = sanitizeIconStyleToken(next[ICON_COLOR_PROPERTY_KEY]);
    const iconBg = sanitizeIconStyleToken(next[ICON_BG_PROPERTY_KEY]);

    if (iconColor.startsWith('text-')) {
        next[ICON_COLOR_PROPERTY_KEY] = iconColor;
    } else {
        delete next[ICON_COLOR_PROPERTY_KEY];
    }

    if (iconBg.startsWith('bg-')) {
        next[ICON_BG_PROPERTY_KEY] = iconBg;
    } else {
        delete next[ICON_BG_PROPERTY_KEY];
    }

    return next;
}

function collectNodeText(node: unknown): string {
    if (!node || typeof node !== 'object') {
        return '';
    }

    const value = node as {
        type?: unknown;
        text?: unknown;
        attrs?: { label?: unknown };
        content?: unknown;
    };

    if (value.type === 'text' && typeof value.text === 'string') {
        return value.text;
    }

    if (value.type === 'mention' && typeof value.attrs?.label === 'string') {
        return value.attrs.label;
    }

    if (!Array.isArray(value.content)) {
        return '';
    }

    return value.content.map((child) => collectNodeText(child)).join('');
}

function extractFirstHeadingTitle(json: unknown): string {
    if (!json || typeof json !== 'object') {
        return '';
    }

    const root = json as { content?: unknown };
    const nodes = Array.isArray(root.content) ? root.content : [];

    for (const node of nodes) {
        if (!node || typeof node !== 'object') {
            continue;
        }

        const candidate = node as {
            type?: unknown;
            attrs?: { level?: unknown };
        };
        const isH1 =
            candidate.type === 'heading' &&
            Number(candidate.attrs?.level ?? 0) === 1;

        if (isH1) {
            return collectNodeText(node).trim();
        }
    }

    return '';
}

export function resolveEditorSaveFlow(
    lastSavedTitle: string,
    nextDocumentJson: unknown,
): 'json' | 'inertia' {
    const currentTitle = extractFirstHeadingTitle(nextDocumentJson);
    return currentTitle !== lastSavedTitle ? 'json' : 'inertia';
}

export function useEditorSave({
    editor,
    noteId,
    noteUpdateUrl,
    enabled = true,
    properties = {},
    idleMs = 1500,
    includeTimeblocks = false,
    saveTransport = 'auto',
}: UseEditorSaveProps) {
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedContentRef = useRef<string>('');
    const lastSavedTitleRef = useRef<string>('');
    const lastSavedPropertiesRef = useRef<string>(JSON.stringify(properties));
    const propertiesRef = useRef<DocumentPropertiesValue>(properties);
    const saveEditorRef = useRef<(force?: boolean) => void>(() => {});
    const pendingSaveRef = useRef(false);
    const pendingForceRef = useRef(false);
    const isSavingRef = useRef(false);
    const noteUpdateUrlRef = useRef(noteUpdateUrl);
    const [status, setStatus] = useState<EditorSaveStatus>('ready');
    const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

    useEffect(() => {
        propertiesRef.current = properties;
    }, [properties]);

    useEffect(() => {
        noteUpdateUrlRef.current = noteUpdateUrl;
    }, [noteUpdateUrl]);

    useEffect(() => {
        if (!enabled) {
            setStatus('ready');
        }
    }, [enabled]);

    const saveEditor = useCallback(
        (force = false) => {
            if (!enabled || !editor) {
                return;
            }

            const json = editor.getJSON();
            const serialized = JSON.stringify(json);
            const sanitizedProperties = sanitizeProperties(propertiesRef.current);
            const serializedProperties = JSON.stringify(sanitizedProperties);
            const currentTitle = extractFirstHeadingTitle(json);
            const timeblocks = includeTimeblocks
                ? editor.storage.timeblock?.timeblocks ?? editor.storage.blockTimeblock?.timeblocks ?? []
                : [];
            const serializedTimeblocks = includeTimeblocks
                ? JSON.stringify(timeblocks)
                : null;

            if (
                !force &&
                serialized === lastSavedContentRef.current &&
                serializedProperties === lastSavedPropertiesRef.current
            ) {
                setStatus('ready');
                return;
            }

            if (isSavingRef.current) {
                pendingSaveRef.current = true;
                pendingForceRef.current = pendingForceRef.current || force;
                return;
            }

            isSavingRef.current = true;
            setStatus('saving');

            const payload = {
                content: json,
                properties: sanitizedProperties,
                ...(includeTimeblocks
                    ? { timeblocks_json: serializedTimeblocks }
                    : {}),
                save_mode: force ? 'manual' : 'auto',
            };
            const saveFlow = saveTransport === 'auto'
                ? resolveEditorSaveFlow(lastSavedTitleRef.current, json)
                : saveTransport;
            const xsrfToken = getCookie('XSRF-TOKEN');

            const finishSave = () => {
                isSavingRef.current = false;

                if (pendingSaveRef.current) {
                    const shouldForce = pendingForceRef.current;
                    pendingSaveRef.current = false;
                    pendingForceRef.current = false;
                    saveEditorRef.current(shouldForce);
                }
            };

            const markSaveSuccess = () => {
                lastSavedContentRef.current = serialized;
                lastSavedPropertiesRef.current = serializedProperties;
                lastSavedTitleRef.current = currentTitle;
                setLastSavedAt(Date.now());
                setStatus('ready');
            };

            if (saveFlow === 'json') {
                void fetch(noteUpdateUrlRef.current, {
                    method: 'PUT',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        ...(xsrfToken
                            ? { 'X-XSRF-TOKEN': xsrfToken }
                            : {}),
                    },
                    body: JSON.stringify(payload),
                })
                    .then(async (response) => {
                        if (!response.ok) {
                            throw new Error(`Save failed: ${response.status}`);
                        }

                        const data = (await response.json().catch(() => ({}))) as {
                            note_url?: string | null;
                            note_update_url?: string | null;
                        };

                        const nextNoteUrl =
                            typeof data.note_url === 'string' && data.note_url.trim() !== ''
                                ? data.note_url.trim()
                                : null;
                        const nextUpdateUrl =
                            typeof data.note_update_url === 'string' &&
                            data.note_update_url.trim() !== ''
                                ? data.note_update_url.trim()
                                : null;

                        if (nextUpdateUrl) {
                            noteUpdateUrlRef.current = nextUpdateUrl;
                        }

                        if (
                            nextNoteUrl &&
                            typeof window !== 'undefined' &&
                            window.location.pathname !== new URL(nextNoteUrl, window.location.origin).pathname
                        ) {
                            const current = new URL(window.location.href);
                            const next = new URL(nextNoteUrl, window.location.origin);
                            next.hash = current.hash;
                            window.history.replaceState(
                                window.history.state,
                                '',
                                `${next.pathname}${next.search}${next.hash}`,
                            );
                        }

                        markSaveSuccess();

                        if (includeTimeblocks) {
                            router.reload({ only: ['todayEvents', 'todayEventsDate'] });
                        }
                    })
                    .catch(() => {
                        setStatus('error');
                    })
                    .finally(() => {
                        finishSave();
                    });

                return;
            }

            router.put(
                noteUpdateUrlRef.current,
                payload,
                {
                    preserveScroll: true,
                    preserveState: true,
                    replace: true,
                    only: ['todayEvents', 'todayEventsDate'],
                    showProgress: force,
                    onSuccess: () => {
                        markSaveSuccess();
                    },
                    onError: () => {
                        setStatus('error');
                    },
                    onFinish: () => {
                        finishSave();
                    },
                },
            );
        },
        [editor, enabled, includeTimeblocks],
    );

    useEffect(() => {
        saveEditorRef.current = saveEditor;
    }, [saveEditor]);

    const queueSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(() => {
            saveEditor();
        }, idleMs);
    }, [idleMs, saveEditor]);

    useEffect(() => {
        if (!enabled || !editor) {
            return;
        }

        lastSavedContentRef.current = JSON.stringify(editor.getJSON());
        lastSavedTitleRef.current = extractFirstHeadingTitle(editor.getJSON());
        lastSavedPropertiesRef.current = JSON.stringify(propertiesRef.current);
        isSavingRef.current = false;
        pendingSaveRef.current = false;
        pendingForceRef.current = false;
        queueMicrotask(() => setStatus('ready'));

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        // Only reset baseline when loading/switching note editor.
         
    }, [editor, enabled, noteId]);

    useEffect(() => {
        if (!enabled || !editor) {
            return;
        }

        const handleUpdate = () => {
            setStatus('dirty');
            queueSave();
        };

        editor.on('update', handleUpdate);

        return () => {
            editor.off('update', handleUpdate);
        };
    }, [editor, enabled, queueSave]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        if (JSON.stringify(properties) === lastSavedPropertiesRef.current) {
            return;
        }

        queueMicrotask(() => setStatus('dirty'));
        queueSave();
    }, [enabled, properties, queueSave]);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                !(event.metaKey || event.ctrlKey) ||
                event.key.toLowerCase() !== 's'
            ) {
                return;
            }

            if (!editor?.isFocused) {
                return;
            }

            event.preventDefault();

            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }

            saveEditor(true);
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [editor, enabled, saveEditor]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        saveEditor,
        queueSave,
        status,
        lastSavedAt,
    };
}
