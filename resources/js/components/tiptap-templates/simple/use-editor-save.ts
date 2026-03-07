import { router } from '@inertiajs/react';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorSaveStatus } from '@/types';

export type DocumentPropertiesValue = Record<string, string>;

type UseEditorSaveProps = {
    editor: Editor | null;
    noteId: string;
    noteUpdateUrl: string;
    properties?: DocumentPropertiesValue;
    idleMs?: number;
};

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
    const isSavingRef = useRef(false);
    const [status, setStatus] = useState<EditorSaveStatus>('ready');

    const saveEditor = useCallback(
        (force = false) => {
            if (!editor) {
                return;
            }

            const json = editor.getJSON();
            const serialized = JSON.stringify(json);
            const serializedProperties = JSON.stringify(properties);

            if (
                !force &&
                serialized === lastSavedContentRef.current &&
                serializedProperties === lastSavedPropertiesRef.current
            ) {
                setStatus('ready');
                return;
            }

            if (isSavingRef.current) {
                return;
            }

            isSavingRef.current = true;
            setStatus('saving');

            router.put(
                noteUpdateUrl,
                {
                    content: json,
                    properties,
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
                    },
                },
            );
        },
        [editor, noteUpdateUrl, properties],
    );

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
        lastSavedPropertiesRef.current = JSON.stringify(properties);
        isSavingRef.current = false;
        setStatus('ready');

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
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

        setStatus('dirty');
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
