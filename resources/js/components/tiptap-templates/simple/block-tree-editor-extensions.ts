import { Extension } from '@tiptap/core';
import { Bold } from '@tiptap/extension-bold';
import { Code } from '@tiptap/extension-code';
import { CodeBlock } from '@tiptap/extension-code-block';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Highlight } from '@tiptap/extension-highlight';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { Image } from '@tiptap/extension-image';
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
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { toast } from 'sonner';
import { ImageUploadNode } from '@/components/tiptap-node/image-upload-node/image-upload-node-extension';
import { BlockDragHandleExtension } from '@/components/tiptap-templates/simple/block-tree/block-drag-handle-extension';
import { BlockHeadingCollapseExtension } from '@/components/tiptap-templates/simple/block-tree/block-heading-collapse-extension';
import { BlockLineActionsExtension } from '@/components/tiptap-templates/simple/block-tree/block-line-actions-extension';
import { BlockLinkBehaviorExtension } from '@/components/tiptap-templates/simple/block-tree/block-link-behavior-extension';
import { BlockTaskActionsExtension } from '@/components/tiptap-templates/simple/block-tree/block-task-actions-extension';
import { BlockTaskMigrationMetaExtension } from '@/components/tiptap-templates/simple/block-tree/block-task-migration-meta-extension';
import { BlockTimeblockExtension } from '@/components/tiptap-templates/simple/block-tree/block-timeblock-extension';
import { BlockTreeDocument } from '@/components/tiptap-templates/simple/block-tree/block-tree-document-extension';
import { createBlockTreeItemExtensions } from '@/components/tiptap-templates/simple/block-tree/block-tree-item-extensions';
import { BlockWikiLinkMark } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-mark-extension';
import type { CreateBlockTreeEditorExtensionsOptions } from '@/components/tiptap-templates/simple/block-tree-editor-extension-options';

const blockImagePastePluginKey = new PluginKey('blockImagePaste');

function extractDataImageUrls(text: string): string[] {
    if (text.trim() === '') {
        return [];
    }

    const matches = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g);
    if (!matches) {
        return [];
    }

    return matches
        .map((value) => value.replace(/\s+/g, '').trim())
        .filter((value) => value !== '');
}

function dataImageUrlToFile(dataUrl: string, index: number): File | null {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
        return null;
    }

    const mimeType = match[1];
    const base64Content = match[2];

    try {
        const binary = atob(base64Content);
        const bytes = new Uint8Array(binary.length);
        for (let byteIndex = 0; byteIndex < binary.length; byteIndex += 1) {
            bytes[byteIndex] = binary.charCodeAt(byteIndex);
        }

        const extension = mimeType.split('/')[1] ?? 'png';

        return new File([bytes], `pasted-image-${index + 1}.${extension}`, {
            type: mimeType,
        });
    } catch {
        return null;
    }
}

function collectClipboardImageFiles(event: ClipboardEvent): File[] {
    const clipboardFiles = Array.from(event.clipboardData?.files ?? []).filter((file) =>
        file.type.startsWith('image/'),
    );

    if (clipboardFiles.length > 0) {
        return clipboardFiles;
    }

    const textPlain = event.clipboardData?.getData('text/plain') ?? '';
    const textHtml = event.clipboardData?.getData('text/html') ?? '';
    const dataUrls = [
        ...extractDataImageUrls(textPlain),
        ...extractDataImageUrls(textHtml),
    ];

    if (dataUrls.length === 0) {
        return [];
    }

    return dataUrls
        .map((value, index) => dataImageUrlToFile(value, index))
        .filter((value): value is File => value instanceof File);
}

function insertUploadedImages(
    view: EditorView,
    urls: string[],
    fileNames: string[],
    dropPosition?: number,
): void {
    const imageNodeType = view.state.schema.nodes.image;
    if (!imageNodeType) {
        return;
    }

    const filtered = urls
        .map((url, index) => ({
            url: typeof url === 'string' ? url.trim() : '',
            fileName: fileNames[index] ?? 'image',
        }))
        .filter((item) => item.url !== '');

    if (filtered.length === 0) {
        return;
    }

    const basePosition = dropPosition ?? view.state.selection.from;
    let position = basePosition;
    let transaction = view.state.tr;

    for (const item of filtered) {
        const alt = item.fileName.replace(/\.[^/.]+$/, '').trim();
        const imageNode = imageNodeType.create({
            src: item.url,
            alt: alt !== '' ? alt : 'image',
            title: alt !== '' ? alt : null,
        });

        transaction = transaction.insert(position, imageNode);
        position += imageNode.nodeSize;
    }

    view.dispatch(transaction.scrollIntoView());
}

function createBlockImageUploadExtension(
    options: CreateBlockTreeEditorExtensionsOptions,
) {
    return Extension.create({
        name: 'blockImageUpload',
        addProseMirrorPlugins() {
            return [
                new Plugin({
                    key: blockImagePastePluginKey,
                    props: {
                        handlePaste: (_view, event) => {
                            const upload = options.imageUploadHandler;
                            if (!upload) {
                                return false;
                            }

                            const imageFiles = collectClipboardImageFiles(event);

                            if (imageFiles.length === 0) {
                                return false;
                            }

                            event.preventDefault();

                            const view = _view;
                            const toastId = toast.loading(
                                imageFiles.length === 1
                                    ? 'Uploading image...'
                                    : `Uploading ${imageFiles.length} images...`,
                            );
                            void Promise.all(
                                imageFiles.map((file) => upload(file)),
                            ).then((urls) => {
                                insertUploadedImages(
                                    view,
                                    urls,
                                    imageFiles.map((file) => file.name),
                                );
                                toast.success(
                                    imageFiles.length === 1
                                        ? 'Image uploaded.'
                                        : `${imageFiles.length} images uploaded.`,
                                    { id: toastId },
                                );
                            }).catch((error) => {
                                toast.error('Image upload failed.', { id: toastId });
                                console.error('Image paste upload failed', error);
                            });

                            return true;
                        },
                        handleDrop: (view, event) => {
                            const upload = options.imageUploadHandler;
                            if (!upload || !event.dataTransfer) {
                                return false;
                            }

                            const droppedFiles = Array.from(event.dataTransfer.files);
                            const imageFiles = droppedFiles.filter((file) =>
                                file.type.startsWith('image/'),
                            );
                            if (imageFiles.length === 0) {
                                return false;
                            }

                            event.preventDefault();

                            const dropPosition = view.posAtCoords({
                                left: event.clientX,
                                top: event.clientY,
                            })?.pos;

                            const toastId = toast.loading(
                                imageFiles.length === 1
                                    ? 'Uploading image...'
                                    : `Uploading ${imageFiles.length} images...`,
                            );
                            void Promise.all(
                                imageFiles.map((file) => upload(file)),
                            ).then((urls) => {
                                insertUploadedImages(
                                    view,
                                    urls,
                                    imageFiles.map((file) => file.name),
                                    dropPosition,
                                );
                                toast.success(
                                    imageFiles.length === 1
                                        ? 'Image uploaded.'
                                        : `${imageFiles.length} images uploaded.`,
                                    { id: toastId },
                                );
                            }).catch((error) => {
                                toast.error('Image upload failed.', { id: toastId });
                                console.error('Image drop upload failed', error);
                            });

                            return true;
                        },
                    },
                }),
            ];
        },
    });
}

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
        Image,
        Link.configure({
            openOnClick: false,
            enableClickSelection: true,
        }),
        Code,
        Italic,
        Strike,
        Underline,
        Highlight.configure({
            multicolor: true,
        }),
        UndoRedo,
        BlockHeadingCollapseExtension,
        BlockLineActionsExtension,
        BlockTaskActionsExtension,
        BlockDragHandleExtension,
        BlockLinkBehaviorExtension,
        Typography.configure({
            laquo: false,
            raquo: false,
        }),
        ImageUploadNode.configure({
            accept: 'image/*',
            limit: 3,
            maxSize: 10 * 1024 * 1024,
            upload: options.imageUploadHandler,
            onError: (error) => {
                toast.error(error instanceof Error ? error.message : 'Image upload failed.');
                console.error('Image upload failed', error);
            },
        }),
        createBlockImageUploadExtension(options),
        BlockWikiLinkMark.configure({
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
            syncStatusByBlockId: options.timeblockSyncByBlockId ?? {},
            defaultDurationMinutes: options.defaultTimeblockDurationMinutes ?? 60,
        }),
        BlockTreeDocument,
        ...createBlockTreeItemExtensions(options),
    ];
}
