import { router } from '@inertiajs/react';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef } from 'react';

export type DocumentPropertiesValue = Record<string, string>;

type UseEditorSaveProps = {
    editor: Editor | null;
    noteId: string;
    properties?: DocumentPropertiesValue;
    idleMs?: number;
};

export function useEditorSave({
    editor,
    noteId,
    properties = {},
    idleMs = 1500,
}: UseEditorSaveProps) {
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedContentRef = useRef<string>('');
    const lastSavedPropertiesRef = useRef<string>(JSON.stringify(properties));
    const isSavingRef = useRef(false);

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
                return;
            }

            if (isSavingRef.current) {
                return;
            }

            isSavingRef.current = true;

            router.put(
                `/notes/${noteId}`,
                {
                    content: json,
                    properties,
                },
                {
                    preserveState: true,
                    preserveScroll: true,
                    replace: true,
                    onSuccess: () => {
                        lastSavedContentRef.current = serialized;
                        lastSavedPropertiesRef.current = serializedProperties;
                    },
                    onFinish: () => {
                        isSavingRef.current = false;
                    },
                },
            );
        },
        [editor, noteId, properties],
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
    }, [editor]);

    useEffect(() => {
        lastSavedPropertiesRef.current = JSON.stringify(properties);
    }, [properties]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const handleUpdate = () => {
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
    };
}
