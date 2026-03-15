'use client';

import { memo } from 'react';
import { SimpleEditorBlock } from '@/components/tiptap-templates/simple/simple-editor-block';
import { SimpleEditorLegacy } from '@/components/tiptap-templates/simple/simple-editor-legacy';
import type { SimpleEditorProps } from '@/components/tiptap-templates/simple/simple-editor-types';

function SimpleEditorComponent(props: SimpleEditorProps) {
    const editorKey = `${props.editorMode ?? 'legacy'}:${props.id ?? ''}`;

    return props.editorMode === 'block'
        ? <SimpleEditorBlock key={editorKey} {...props} editorMode="block" />
        : <SimpleEditorLegacy key={editorKey} {...props} editorMode="legacy" />;
}

export const SimpleEditor = memo(SimpleEditorComponent);
export type { SimpleEditorProps };
