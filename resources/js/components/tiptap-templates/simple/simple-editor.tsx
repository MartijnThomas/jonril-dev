'use client';

import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { NoteRelatedPanel } from '@/components/note-related-panel';
import { DocumentProperties } from '@/components/tiptap-properties/document-properties';
import type { DocumentPropertiesValue } from '@/components/tiptap-properties/document-properties';
import {
    EditorBubbleToolbar,
    MobileEditorToolbar,
} from '@/components/tiptap-templates/simple/editor-toolbar';
import { createSimpleEditorExtensions } from '@/components/tiptap-templates/simple/simple-editor-extensions';
import { useEditorSave } from '@/components/tiptap-templates/simple/use-editor-save';
import { useCursorVisibility } from '@/hooks/use-cursor-visibility';
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint';
import { useWindowSize } from '@/hooks/use-window-size';
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
    linkableNotes?: { id: string; title: string; path?: string; href?: string }[];
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
        heading: string | null;
        heading_level: number | null;
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
    const isMobile = useIsBreakpoint();
    const { height } = useWindowSize();

    const [mobileView, setMobileView] = useState<
        'main' | 'highlighter' | 'link'
    >('main');

    const [documentProperties, setDocumentProperties] =
        useState<DocumentPropertiesValue>(properties);
    const mentionSuggestions =
        workspaceSuggestions?.mentions ?? EMPTY_SUGGESTIONS;
    const hashtagSuggestions =
        workspaceSuggestions?.hashtags ?? EMPTY_SUGGESTIONS;

    const toolbarRef = useRef<HTMLDivElement>(null);
    const previousNoteIdRef = useRef<string | null>(null);

    const extensions = useMemo(
        () =>
            createSimpleEditorExtensions({
                wikiLinkNotes: linkableNotes,
                workspaceSuggestions: {
                    mentions: mentionSuggestions,
                    hashtags: hashtagSuggestions,
                },
                language,
            }),
        [language, linkableNotes, mentionSuggestions, hashtagSuggestions],
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
            return;
        }

        if (previousNoteIdRef.current === id) {
            return;
        }

        previousNoteIdRef.current = id;
        editor.commands.setContent(initialContent);
    }, [editor, id, initialContent]);

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

    const rect = useCursorVisibility({
        editor,
        overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
    });

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

    return (
        <div className="mx-auto mb-12 max-w-3xl px-8">
            <EditorContext.Provider value={{ editor }}>
                <div className="pt-4">
                    <DocumentProperties
                        value={documentProperties}
                        onChange={setDocumentProperties}
                        onPersistRequested={() => saveEditor(false)}
                        workspaceSuggestions={{
                            mentions: mentionSuggestions,
                            hashtags: hashtagSuggestions,
                        }}
                    />
                </div>
                {showRelatedPanel ? (
                    <NoteRelatedPanel
                        key={id}
                        relatedTasks={relatedTasks}
                        backlinks={backlinks}
                        language={language}
                    />
                ) : null}

                {editor && !isMobile && <EditorBubbleToolbar editor={editor} />}

                {isMobile && (
                    <MobileEditorToolbar
                        height={height}
                        rectY={rect.y}
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
                    className="simple-editor-content pb-12"
                />
            </EditorContext.Provider>

        </div>
    );
}
