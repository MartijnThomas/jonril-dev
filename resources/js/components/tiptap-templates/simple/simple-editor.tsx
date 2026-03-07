'use client';

import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DocumentProperties } from '@/components/tiptap-properties/document-properties';
import type { DocumentPropertiesValue } from '@/components/tiptap-properties/document-properties';

import { useCursorVisibility } from '@/hooks/use-cursor-visibility';
import { useIsBreakpoint } from '@/hooks/use-is-breakpoint';
import { useWindowSize } from '@/hooks/use-window-size';
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
    content?: SimpleEditorContent;
    properties?: DocumentPropertiesValue;
    showDebug?: boolean;
};

export function SimpleEditor({
    id,
    content = '',
    properties = {},
    showDebug = true,
}: SimpleEditorProps) {
    const isMobile = useIsBreakpoint();
    const { height } = useWindowSize();

    const [mobileView, setMobileView] = useState<
        'main' | 'highlighter' | 'link'
    >('main');

    const [documentProperties, setDocumentProperties] =
        useState<DocumentPropertiesValue>(properties);

    const toolbarRef = useRef<HTMLDivElement>(null);

    const extensions = useMemo(() => createSimpleEditorExtensions(), []);

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

        editor.isMobile = isMobile;
    }, [editor, isMobile]);

    useEffect(() => {
        if (!isMobile && mobileView !== 'main') {
            setMobileView('main');
        }
    }, [isMobile, mobileView]);

    const { saveEditor } = useEditorSave({
        editor,
        noteId: id,
        properties: documentProperties,
        idleMs: 1500,
    });

    const rect = useCursorVisibility({
        editor,
        overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
    });

    const editorJson = useMemo(() => {
        if (!editor || !showDebug) {
            return '';
        }

        return JSON.stringify(editor.getJSON(), null, 2);
    }, [editor, showDebug, editor?.state]);

    return (
        <div className="">
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
                        toolbarRef={toolbarRef}
                    />
                )}

                <EditorContent
                    editor={editor}
                    role="presentation"
                    className="simple-editor-content"
                />
            </EditorContext.Provider>

            {showDebug && (
                <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="mb-2 text-sm font-medium text-muted-foreground">
                        Editor JSON
                    </div>
                    <pre className="max-h-96 overflow-auto text-xs leading-5 break-words whitespace-pre-wrap">
                        <code>{editorJson}</code>
                    </pre>
                </div>
            )}
        </div>
    );
}
