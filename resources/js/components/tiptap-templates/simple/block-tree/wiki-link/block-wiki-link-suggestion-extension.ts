import { computePosition, flip, shift } from '@floating-ui/dom';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import Suggestion, { exitSuggestion } from '@tiptap/suggestion';
import { BlockWikiLinkList } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-list';
import type {
    BlockWikiLinkNote,
    BlockWikiLinkSuggestionItem,
} from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';
import {
    buildBlockWikiLinkSuggestions,
    fallbackBlockWikiHrefFromTargetPath,
    findCompleteRawWikiLinks,
} from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';

export const blockWikiLinkSuggestionPluginKey = new PluginKey(
    'blockWikiLinkSuggestion',
);

const updatePosition = (editor: any, element: HTMLElement, anchorFrom: number) => {
    const safeFrom = Math.max(1, Math.min(anchorFrom, editor.state.doc.content.size));
    const safeTo = Math.min(safeFrom + 1, editor.state.doc.content.size);
    const virtualElement = {
        getBoundingClientRect: () =>
            posToDOMRect(
                editor.view,
                safeFrom,
                Math.max(safeFrom, safeTo),
            ),
    };

    computePosition(virtualElement, element, {
        placement: 'bottom-start',
        strategy: 'absolute',
        middleware: [shift(), flip()],
    }).then(({ x, y, strategy }) => {
        element.style.width = 'max-content';
        element.style.position = strategy;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
    });
};

export const BlockWikiLinkSuggestion = Extension.create<{
    notes: BlockWikiLinkNote[];
    language: string;
}>({
    name: 'blockWikiLinkSuggestion',

    addOptions() {
        return {
            notes: [],
            language: 'nl',
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion<BlockWikiLinkSuggestionItem>({
                pluginKey: blockWikiLinkSuggestionPluginKey,
                editor: this.editor,
                char: '[[',
                allowSpaces: true,
                startOfLine: false,
                items: ({ query }) => {
                    let effectiveQuery = query;
                    const { state } = this.editor;
                    const parent = state.selection.$from.parent;
                    const parentStart = state.selection.$from.start();
                    const localCursor = Math.max(
                        0,
                        state.selection.from - parentStart,
                    );
                    const parentText = parent.textContent;
                    let openIndex = parentText.lastIndexOf('[[', localCursor);

                    while (openIndex > 0 && parentText[openIndex - 1] === '[') {
                        openIndex -= 1;
                    }

                    const closeIndex =
                        openIndex === -1
                            ? -1
                            : parentText.indexOf(']]', openIndex + 2);
                    const cursorInsideRawWikiLink =
                        openIndex !== -1 &&
                        closeIndex !== -1 &&
                        localCursor >= openIndex + 2 &&
                        localCursor <= closeIndex;

                    if (cursorInsideRawWikiLink) {
                        effectiveQuery = parentText
                            .slice(openIndex + 2, closeIndex)
                            .trim();
                    }
                    return buildBlockWikiLinkSuggestions(
                        this.options.notes,
                        effectiveQuery,
                        this.options.language,
                    );
                },
                command: ({ editor, range, props }) => {
                    let replaceFrom = range.from;
                    let replaceTo = range.to;
                    const { state } = editor;
                    const parent = state.selection.$from.parent;
                    const parentStart = state.selection.$from.start();
                    const localFrom = Math.max(0, range.from - parentStart);
                    const localTo = Math.max(localFrom, range.to - parentStart);

                    const parentText = parent.textContent;
                    let openIndex = parentText.lastIndexOf('[[', localTo);
                    while (openIndex > 0 && parentText[openIndex - 1] === '[') {
                        openIndex -= 1;
                    }

                    const closeIndex = parentText.indexOf(']]', localFrom);
                    if (openIndex !== -1 && closeIndex !== -1 && openIndex < closeIndex) {
                        let closeTo = closeIndex + 2;
                        while (closeTo < parentText.length && parentText[closeTo] === ']') {
                            closeTo += 1;
                        }

                        replaceFrom = parentStart + openIndex;
                        replaceTo = parentStart + closeTo;
                    } else {
                        for (const match of findCompleteRawWikiLinks(parentText)) {
                            const containsRange =
                                localFrom >= match.from && localTo <= match.to;
                            if (!containsRange) {
                                continue;
                            }

                            replaceFrom = parentStart + match.from;
                            replaceTo = parentStart + match.to;
                            break;
                        }
                    }

                    editor
                        .chain()
                        .focus()
                        .insertContentAt(
                            {
                                from: replaceFrom,
                                to: replaceTo,
                            },
                            [
                            {
                                type: 'text',
                                text: props.insertText,
                                marks: [
                                    {
                                        type: 'wikiLink',
                                        attrs: {
                                            noteId: props.noteId,
                                            href:
                                                props.href ||
                                                fallbackBlockWikiHrefFromTargetPath(
                                                    props.targetPath,
                                                    props.noteId,
                                                    props.targetBlockId,
                                                ),
                                            targetPath: props.targetPath,
                                            targetBlockId: props.targetBlockId ?? null,
                                        },
                                    },
                                ],
                            },
                            {
                                type: 'text',
                                text: ' ',
                            },
                            ],
                        )
                        .run();

                    exitSuggestion(editor.view, blockWikiLinkSuggestionPluginKey);
                },
                render: () => {
                    let component: ReactRenderer<any, any>;
                    let anchorFrom = 1;

                    return {
                        onStart: (props) => {
                            component = new ReactRenderer(BlockWikiLinkList, {
                                props,
                                editor: props.editor,
                            });
                            anchorFrom = Math.max(1, props.range.from);

                            if (!props.clientRect) {
                                return;
                            }

                            component.element.style.position = 'absolute';
                            document.body.appendChild(component.element);
                            updatePosition(props.editor, component.element, anchorFrom);
                        },
                        onUpdate(props) {
                            if (
                                props.editor.state.selection.empty &&
                                props.editor.state.selection.from === props.range.from &&
                                props.range.to > props.range.from
                            ) {
                                props.editor.commands.setTextSelection(props.range.to);
                                return;
                            }

                            component.updateProps(props);

                            if (!props.clientRect) {
                                return;
                            }

                            updatePosition(props.editor, component.element, anchorFrom);
                        },
                        onKeyDown(props) {
                            if (props.event.key === 'Escape') {
                                component.destroy();
                                return true;
                            }

                            return component.ref?.onKeyDown(props) ?? false;
                        },
                        onExit() {
                            component.element.remove();
                            component.destroy();
                        },
                    };
                },
            }),
        ];
    },
});
