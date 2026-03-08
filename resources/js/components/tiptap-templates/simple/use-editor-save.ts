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
    properties?: DocumentPropertiesValue;
    idleMs?: number;
};

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

export function useEditorSave({
    editor,
    noteId,
    noteUpdateUrl,
    properties = {},
    idleMs = 1500,
}: UseEditorSaveProps) {
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedContentRef = useRef<string>('');
    const lastSavedPropertiesRef = useRef<string>(JSON.stringify(properties));
    const propertiesRef = useRef<DocumentPropertiesValue>(properties);
    const saveEditorRef = useRef<(force?: boolean) => void>(() => {});
    const pendingSaveRef = useRef(false);
    const pendingForceRef = useRef(false);
    const isSavingRef = useRef(false);
    const [status, setStatus] = useState<EditorSaveStatus>('ready');

    useEffect(() => {
        propertiesRef.current = properties;
    }, [properties]);

    const saveEditor = useCallback(
        (force = false) => {
            if (!editor) {
                return;
            }

            const json = editor.getJSON();
            const serialized = JSON.stringify(json);
            const sanitizedProperties = sanitizeProperties(propertiesRef.current);
            const serializedProperties = JSON.stringify(sanitizedProperties);

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

            router.put(
                noteUpdateUrl,
                {
                    content: json,
                    properties: sanitizedProperties,
                    save_mode: force ? 'manual' : 'auto',
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    onSuccess: () => {
                        lastSavedContentRef.current = serialized;
                        lastSavedPropertiesRef.current = serializedProperties;
                        setStatus('ready');
                    },
                    onError: () => {
                        setStatus('error');
                    },
                    onFinish: () => {
                        isSavingRef.current = false;

                        if (pendingSaveRef.current) {
                            const shouldForce = pendingForceRef.current;
                            pendingSaveRef.current = false;
                            pendingForceRef.current = false;
                            saveEditorRef.current(shouldForce);
                        }
                    },
                },
            );
        },
        [editor, noteUpdateUrl],
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
        if (!editor) {
            return;
        }

        lastSavedContentRef.current = JSON.stringify(editor.getJSON());
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor, noteId]);

    useEffect(() => {
        if (!editor) {
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
    }, [editor, queueSave]);

    useEffect(() => {
        if (JSON.stringify(properties) === lastSavedPropertiesRef.current) {
            return;
        }

        queueMicrotask(() => setStatus('dirty'));
        queueSave();
    }, [properties, queueSave]);

    useEffect(() => {
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
    }, [editor, saveEditor]);

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
    };
}
