'use client';

import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DocumentProperties } from '@/components/tiptap-properties/document-properties';
import type { DocumentPropertiesValue } from '@/components/tiptap-properties/document-properties';

import { useCursorVisibility } from '@/hooks/use-cursor-visibility';
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint';
import { useWindowSize } from '@/hooks/use-window-size';
import type { EditorSaveStatus } from '@/types';
import {
    EditorBubbleToolbar,
    MobileEditorToolbar,
} from '@/components/tiptap-templates/simple/editor-toolbar';
import { createSimpleEditorExtensions } from '@/components/tiptap-templates/simple/simple-editor-extensions';
import { useEditorSave } from '@/components/tiptap-templates/simple/use-editor-save';

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

type SimpleEditorProps = {
    id: string;
    noteUpdateUrl: string;
    content?: SimpleEditorContent;
    properties?: DocumentPropertiesValue;
    linkableNotes?: { id: string; title: string; path?: string; href?: string }[];
    language?: 'nl' | 'en';
    onSaveStatusChange?: (status: EditorSaveStatus) => void;
    onDebugJsonChange?: (json: string) => void;
};

export function SimpleEditor({
    id,
    noteUpdateUrl,
    content = '',
    properties = {},
    linkableNotes = [],
    language = 'nl',
    onSaveStatusChange,
    onDebugJsonChange,
}: SimpleEditorProps) {
    const isMobile = useIsBreakpoint();
    const { height } = useWindowSize();

    const [mobileView, setMobileView] = useState<
        'main' | 'highlighter' | 'link'
    >('main');

    const [documentProperties, setDocumentProperties] =
        useState<DocumentPropertiesValue>(properties);

    const toolbarRef = useRef<HTMLDivElement>(null);
    const previousNoteIdRef = useRef<string | null>(null);

    const extensions = useMemo(
        () =>
            createSimpleEditorExtensions({
                wikiLinkNotes: linkableNotes,
                language,
            }),
        [language, linkableNotes],
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

    const { status } = useEditorSave({
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

    return (
        <div className="mx-auto mb-12 max-w-3xl px-8">
            <EditorContext.Provider value={{ editor }}>
                <div className="pt-4">
                    <DocumentProperties
                        value={documentProperties}
                        onChange={setDocumentProperties}
                    />
                </div>

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
