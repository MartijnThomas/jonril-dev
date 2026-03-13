import {
    createBlockTreeEditorExtensions,
} from '@/components/tiptap-templates/simple/block-tree-editor-extensions';
import {
    createLegacyEditorExtensions,
    type CreateSimpleEditorExtensionsOptions,
} from '@/components/tiptap-templates/simple/legacy-editor-extensions';

export function createSimpleEditorExtensions(
    options: CreateSimpleEditorExtensionsOptions = {},
) {
    return options.editorMode === 'block'
        ? createBlockTreeEditorExtensions(options)
        : createLegacyEditorExtensions(options);
}
