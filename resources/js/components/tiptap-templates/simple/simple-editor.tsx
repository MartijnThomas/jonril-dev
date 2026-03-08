'use client';

import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { NoteRelatedPanel } from '@/components/note-related-panel';
import { NOTE_TITLE_ICON_PLUGIN_KEY } from '@/components/tiptap-extension/note-title-icon-extension';
import { DocumentProperties } from '@/components/tiptap-properties/document-properties';
import type { DocumentPropertiesValue } from '@/components/tiptap-properties/document-properties';
import {
    EditorBubbleToolbar,
    MobileEditorToolbar,
} from '@/components/tiptap-templates/simple/editor-toolbar';
import { createSimpleEditorExtensions } from '@/components/tiptap-templates/simple/simple-editor-extensions';
import { useEditorSave } from '@/components/tiptap-templates/simple/use-editor-save';
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint';
import { sanitizeIconStyleToken } from '@/lib/icon-style';
import type { EditorSaveStatus } from '@/types';

import '@/components/tiptap-node/blockquote-node/blockquote-node.scss';
import '@/components/tiptap-node/code-block-node/code-block-node.scss';
import '@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss';
import '@/components/tiptap-node/list-node/list-node.scss';
import '@/components/tiptap-node/image-node/image-node.scss';
import '@/components/tiptap-node/heading-node/heading-node.scss';
import '@/components/tiptap-node/paragraph-node/paragraph-node.scss';

import '@/components/tiptap-templates/simple/simple-editor.scss';
import '@/components/tiptap-templates/simple/styling.css';

type SimpleEditorContent = string | Record<string, any> | null;
const EMPTY_SUGGESTIONS: string[] = [];

type SimpleEditorProps = {
    id: string;
    noteUpdateUrl: string;
    content?: SimpleEditorContent;
    properties?: DocumentPropertiesValue;
    linkableNotes?: {
        id: string;
        title: string;
        path?: string;
        href?: string;
    }[];
    workspaceSuggestions?: {
        mentions: string[];
        hashtags: string[];
    };
    relatedTasks?: {
        id: number;
        note_id: string;
        block_id: string | null;
        position: number;
        checked: boolean;
        content: string;
        render_fragments: {
            type:
                | 'text'
                | 'mention'
                | 'hashtag'
                | 'wikilink'
                | 'due_date_token'
                | 'deadline_date_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
        }[];
        due_date: string | null;
        deadline_date: string | null;
        note: {
            id: string;
            title: string;
            href: string;
        };
    }[];
    backlinks?: {
        id: string;
        block_id: string;
        excerpt: string;
        render_fragments: {
            type:
                | 'text'
                | 'mention'
                | 'hashtag'
                | 'wikilink'
                | 'due_date_token'
                | 'deadline_date_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
        }[];
        note: {
            id: string;
            title: string;
            href: string;
        };
        href: string;
    }[];
    showRelatedPanel?: boolean;
    language?: 'nl' | 'en';
    onSaveStatusChange?: (status: EditorSaveStatus) => void;
    onDebugJsonChange?: (json: string) => void;
    onContentStatsChange?: (stats: {
        words: number;
        characters: number;
        tasksTotal: number;
        tasksClosed: number;
    }) => void;
};

export function SimpleEditor({
    id,
    noteUpdateUrl,
    content = '',
    properties = {},
    linkableNotes = [],
    workspaceSuggestions,
    relatedTasks = [],
    backlinks = [],
    showRelatedPanel = false,
    language = 'nl',
    onSaveStatusChange,
    onDebugJsonChange,
    onContentStatsChange,
}: SimpleEditorProps) {
    const isMobileBreakpoint = useIsBreakpoint();
    const isMobile =
        isMobileBreakpoint &&
        (typeof window === 'undefined' ? true : window.innerWidth < 768);

    const [mobileView, setMobileView] = useState<
        'main' | 'highlighter' | 'link'
    >('main');

    const [documentProperties, setDocumentProperties] =
        useState<DocumentPropertiesValue>(properties);
    const noteIconProp = documentProperties.icon;
    const noteIconColorProp = documentProperties['icon-color'];
    const noteIconBgProp = documentProperties['icon-bg'];
    const mentionSuggestions =
        workspaceSuggestions?.mentions ?? EMPTY_SUGGESTIONS;
    const hashtagSuggestions =
        workspaceSuggestions?.hashtags ?? EMPTY_SUGGESTIONS;

    const toolbarRef = useRef<HTMLDivElement>(null);
    const previousNoteIdRef = useRef<string | null>(null);
    const previousLoadedContentRef = useRef<SimpleEditorContent | null>(null);

    const extensions = useMemo(
        () =>
            createSimpleEditorExtensions({
                wikiLinkNotes: linkableNotes,
                workspaceSuggestions: {
                    mentions: mentionSuggestions,
                    hashtags: hashtagSuggestions,
                },
                language,
                noteIcon:
                    typeof noteIconProp === 'string'
                        ? noteIconProp
                        : null,
                noteIconColor: sanitizeIconStyleToken(noteIconColorProp),
                noteIconBg: sanitizeIconStyleToken(noteIconBgProp),
            }),
        [
            noteIconBgProp,
            noteIconColorProp,
            noteIconProp,
            language,
            linkableNotes,
            mentionSuggestions,
            hashtagSuggestions,
        ],
    );

    const initialContent = useMemo(() => {
        if (typeof content === 'string') {
            return content;
        }

        if (
            content &&
            typeof content === 'object' &&
            !Array.isArray(content) &&
            'type' in content
        ) {
            return content;
        }

        return '';
    }, [content]);

    const editor = useEditor({
        immediatelyRender: false,
        editorProps: {
            attributes: {
                autocomplete: 'off',
                autocorrect: 'off',
                autocapitalize: 'off',
                spellcheck: 'false',
                'aria-label': 'Main content area, start typing to enter text.',
                class: 'simple-editor',
            },
        },
        extensions,
        contentType: 'json',
        content: initialContent,
    });

    useEffect(() => {
        setDocumentProperties(properties);
    }, [properties]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        if (previousNoteIdRef.current === null) {
            previousNoteIdRef.current = id;
            previousLoadedContentRef.current = initialContent;
            return;
        }

        const noteChanged = previousNoteIdRef.current !== id;
        const contentChanged = previousLoadedContentRef.current !== initialContent;

        if (noteChanged || contentChanged) {
            previousNoteIdRef.current = id;
            previousLoadedContentRef.current = initialContent;
            editor.commands.setContent(initialContent);
        }
    }, [editor, id, initialContent]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const handleFocusShortcut = (event: KeyboardEvent) => {
            const isFocusShortcut =
                (event.metaKey || event.ctrlKey) &&
                event.shiftKey &&
                event.key.toLowerCase() === 'e';

            if (!isFocusShortcut || event.defaultPrevented || event.isComposing) {
                return;
            }

            event.preventDefault();

            requestAnimationFrame(() => {
                if (!editor.isDestroyed) {
                    editor.commands.focus();
                }
            });
        };

        window.addEventListener('keydown', handleFocusShortcut);

        return () => {
            window.removeEventListener('keydown', handleFocusShortcut);
        };
    }, [editor]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        // eslint-disable-next-line react-hooks/immutability
        editor.isMobile = isMobile;
    }, [editor, isMobile]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const updateWikiLinkEditClass = () => {
            const dom = editor.view.dom as HTMLElement;
            const isEditingWikiLink = editor.isActive('wikiLink');
            dom.classList.toggle('md-wikilink-edit-active', isEditingWikiLink);
        };

        updateWikiLinkEditClass();
        editor.on('selectionUpdate', updateWikiLinkEditClass);
        editor.on('focus', updateWikiLinkEditClass);
        editor.on('blur', updateWikiLinkEditClass);

        return () => {
            editor.off('selectionUpdate', updateWikiLinkEditClass);
            editor.off('focus', updateWikiLinkEditClass);
            editor.off('blur', updateWikiLinkEditClass);
            (editor.view.dom as HTMLElement).classList.remove(
                'md-wikilink-edit-active',
            );
        };
    }, [editor]);

    useEffect(() => {
        if (!isMobile && mobileView !== 'main') {
            setMobileView('main');
        }
    }, [isMobile, mobileView]);

    const { status, saveEditor } = useEditorSave({
        editor,
        noteId: id,
        noteUpdateUrl,
        properties: documentProperties,
        idleMs: 1500,
    });

    useEffect(() => {
        onSaveStatusChange?.(status);
    }, [onSaveStatusChange, status]);

    useEffect(() => {
        if (!editor || !onDebugJsonChange) {
            return;
        }

        const emit = () => {
            onDebugJsonChange(JSON.stringify(editor.getJSON(), null, 2));
        };

        emit();
        editor.on('update', emit);

        return () => {
            editor.off('update', emit);
        };
    }, [editor, onDebugJsonChange]);

    useEffect(() => {
        if (!editor || !onContentStatsChange) {
            return;
        }

        const emit = () => {
            const words =
                editor.storage.characterCount?.words?.() ??
                editor.getText().trim().split(/\s+/).filter(Boolean).length;
            const characters =
                editor.storage.characterCount?.characters?.() ??
                editor.getText().length;

            let tasksTotal = 0;
            let tasksClosed = 0;

            editor.state.doc.descendants((node) => {
                if (node.type.name !== 'taskItem') {
                    return true;
                }

                tasksTotal += 1;
                if (node.attrs.checked === true) {
                    tasksClosed += 1;
                }

                return true;
            });

            onContentStatsChange({
                words,
                characters,
                tasksTotal,
                tasksClosed,
            });
        };

        emit();
        editor.on('update', emit);

        return () => {
            editor.off('update', emit);
        };
    }, [editor, onContentStatsChange]);

    useEffect(() => {
        if (!editor) {
            return;
        }
        const iconName =
            typeof noteIconProp === 'string' &&
            noteIconProp.trim() !== ''
                ? noteIconProp.trim()
                : null;
        const iconColor = sanitizeIconStyleToken(noteIconColorProp);
        const iconBg = sanitizeIconStyleToken(noteIconBgProp);

        const transaction = editor.state.tr.setMeta(
            NOTE_TITLE_ICON_PLUGIN_KEY,
            {
                iconName,
                iconColor: iconColor.startsWith('text-') ? iconColor : null,
                iconBg: iconBg.startsWith('bg-') ? iconBg : null,
            },
        );
        editor.view.dispatch(transaction);

    }, [
        noteIconBgProp,
        noteIconColorProp,
        noteIconProp,
        editor,
    ]);

    return (
        <div className="mx-auto max-w-3xl px-8">
            <EditorContext.Provider value={{ editor }}>
                {showRelatedPanel ? (
                    <div className="mt-4">
                        <NoteRelatedPanel
                            key={id}
                            relatedTasks={relatedTasks}
                            backlinks={backlinks}
                            language={language}
                        />
                    </div>
                ) : null}

                <div className="pt-1">
                    <DocumentProperties
                        value={documentProperties}
                        onChange={setDocumentProperties}
                        onPersistRequested={() => {
                            requestAnimationFrame(() => {
                                saveEditor(false);
                            });
                        }}
                        workspaceSuggestions={{
                            mentions: mentionSuggestions,
                            hashtags: hashtagSuggestions,
                        }}
                    />
                </div>

                {editor && !isMobile && <EditorBubbleToolbar editor={editor} />}

                {isMobile && (
                    <MobileEditorToolbar
                        mobileView={mobileView}
                        onBack={() => setMobileView('main')}
                        onHighlighterClick={() => setMobileView('highlighter')}
                        onLinkClick={() => setMobileView('link')}
                        onCommandPaletteClick={() => {
                            window.dispatchEvent(
                                new Event('open-command-palette'),
                            );
                        }}
                        toolbarRef={toolbarRef}
                    />
                )}

                <EditorContent
                    editor={editor}
                    role="presentation"
                    className="simple-editor-content mt-8"
                />
            </EditorContext.Provider>
        </div>
    );
}
