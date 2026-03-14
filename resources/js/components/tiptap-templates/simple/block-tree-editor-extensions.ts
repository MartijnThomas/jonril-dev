import { Bold } from '@tiptap/extension-bold';
import { Code } from '@tiptap/extension-code';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Highlight } from '@tiptap/extension-highlight';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { Strike } from '@tiptap/extension-strike';
import { Text } from '@tiptap/extension-text';
import { Typography } from '@tiptap/extension-typography';
import { Underline } from '@tiptap/extension-underline';
import { UndoRedo } from '@tiptap/extensions/undo-redo';
import { BlockLinkBehaviorExtension } from '@/components/tiptap-templates/simple/block-tree/block-link-behavior-extension';
import { BlockTreeDocument } from '@/components/tiptap-templates/simple/block-tree/block-tree-document-extension';
import { createBlockTreeItemExtensions } from '@/components/tiptap-templates/simple/block-tree/block-tree-item-extensions';
import { BlockWikiLinkMark } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-mark-extension';
import { BlockWikiLinkSuggestion } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-suggestion-extension';
import type { CreateSimpleEditorExtensionsOptions } from '@/components/tiptap-templates/simple/simple-editor-extension-options';

export function createBlockTreeEditorExtensions(
    options: CreateSimpleEditorExtensionsOptions = {},
) {
    return [
        Text,
        HardBreak.configure({
            keepMarks: true,
        }),
        Bold,
        Link.configure({
            openOnClick: false,
            enableClickSelection: true,
        }),
        Code,
        Italic,
        Strike,
        Underline,
        Highlight.configure({
            multicolor: false,
        }),
        UndoRedo,
        BlockLinkBehaviorExtension,
        Typography.configure({
            laquo: false,
            raquo: false,
        }),
        BlockWikiLinkMark.configure({
            notes: options.wikiLinkNotes ?? [],
            language: options.language ?? 'nl',
        }),
        BlockWikiLinkSuggestion.configure({
            notes: options.wikiLinkNotes ?? [],
            language: options.language ?? 'nl',
        }),
        BlockTreeDocument,
        ...createBlockTreeItemExtensions(options),
    ];
}
