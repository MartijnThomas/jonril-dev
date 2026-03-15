import { Bold } from '@tiptap/extension-bold';
import { Code } from '@tiptap/extension-code';
import { CodeBlock } from '@tiptap/extension-code-block';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Highlight } from '@tiptap/extension-highlight';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { Italic } from '@tiptap/extension-italic';
import { Link } from '@tiptap/extension-link';
import { Strike } from '@tiptap/extension-strike';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Text } from '@tiptap/extension-text';
import { Typography } from '@tiptap/extension-typography';
import { Underline } from '@tiptap/extension-underline';
import UniqueID from '@tiptap/extension-unique-id';
import { UndoRedo } from '@tiptap/extensions/undo-redo';
import { BlockDragHandleExtension } from '@/components/tiptap-templates/simple/block-tree/block-drag-handle-extension';
import { BlockHeadingCollapseExtension } from '@/components/tiptap-templates/simple/block-tree/block-heading-collapse-extension';
import { BlockLinkBehaviorExtension } from '@/components/tiptap-templates/simple/block-tree/block-link-behavior-extension';
import { BlockTaskActionsExtension } from '@/components/tiptap-templates/simple/block-tree/block-task-actions-extension';
import { BlockTaskMigrationMetaExtension } from '@/components/tiptap-templates/simple/block-tree/block-task-migration-meta-extension';
import { BlockTimeblockExtension } from '@/components/tiptap-templates/simple/block-tree/block-timeblock-extension';
import { BlockTreeDocument } from '@/components/tiptap-templates/simple/block-tree/block-tree-document-extension';
import { createBlockTreeItemExtensions } from '@/components/tiptap-templates/simple/block-tree/block-tree-item-extensions';
import { BlockWikiLinkMark } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-mark-extension';
import { BlockWikiLinkSuggestion } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-suggestion-extension';
import type { CreateBlockTreeEditorExtensionsOptions } from '@/components/tiptap-templates/simple/block-tree-editor-extension-options';

export function createBlockTreeEditorExtensions(
    options: CreateBlockTreeEditorExtensionsOptions = {},
) {
    return [
        UniqueID.configure({
            types: ['heading', 'paragraph', 'codeBlock'],
        }),
        Text,
        HardBreak.configure({
            keepMarks: true,
        }),
        Bold,
        Superscript,
        Subscript,
        CodeBlock,
        HorizontalRule,
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
        BlockHeadingCollapseExtension,
        BlockTaskActionsExtension,
        BlockDragHandleExtension,
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
        BlockTaskMigrationMetaExtension.configure({
            notes: options.wikiLinkNotes ?? [],
        }),
        BlockTimeblockExtension.configure({
            enabled:
                options.noteType === 'journal' &&
                options.journalGranularity === 'daily' &&
                typeof options.journalDate === 'string' &&
                options.journalDate.trim() !== '',
            journalDate: options.journalDate ?? null,
            defaultDurationMinutes: options.defaultTimeblockDurationMinutes ?? 60,
        }),
        BlockTreeDocument,
        ...createBlockTreeItemExtensions(options),
    ];
}
