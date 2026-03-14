import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Heading } from '@tiptap/extension-heading';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { findBlockInlineTokenRanges } from '@/components/tiptap-templates/simple/block-tree/block-tree-inline-tokens';
import {
    formatLocalizedDate,
    detectTaskStatusFromTextPrefix,
    getParagraphMarkerBounds,
    getCurrentBlockNode,
    getCurrentBlockNodeFromState,
    headingTextPrefix,
    dedentCurrentParagraph,
    decreaseCurrentHeadingLevel,
    indentCurrentParagraph,
    isAtEndOfCurrentBlock,
    isAtStartOfCurrentBlock,
    normalizeHeadingPrefixesFromAttrs,
    normalizeHeadingAttrs,
    normalizeParagraphAttrs,
    parseBlockTaskDateTokens,
    parseBlockTaskPriority,
    removeParagraphStyleOrDedentCurrentParagraph,
    syncHeadingBlocksFromText,
    toggleParagraphTaskAtPos,
    syncTaskParagraphStatusesFromText,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { findCompleteRawWikiLinks } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';
import type { CreateSimpleEditorExtensionsOptions } from '@/components/tiptap-templates/simple/simple-editor-extension-options';

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        blockTree: {
            indentBlockParagraph: () => ReturnType;
            dedentBlockParagraph: () => ReturnType;
        };
    }
}

export const BlockParagraph = Paragraph.extend({
    addAttributes() {
        return {
            ...(this.parent?.() ?? {}),
            id: {
                default: null,
                rendered: false,
            },
            indent: {
                default: 0,
                rendered: false,
            },
            blockStyle: {
                default: 'paragraph',
                rendered: false,
            },
            order: {
                default: 1,
                rendered: false,
            },
            checked: {
                default: false,
                rendered: false,
            },
            taskStatus: {
                default: null,
                rendered: false,
            },
            dueDate: {
                default: null,
                rendered: false,
            },
            deadlineDate: {
                default: null,
                rendered: false,
            },
            startedAt: {
                default: null,
                rendered: false,
            },
            completedAt: {
                default: null,
                rendered: false,
            },
            backlogPromotedAt: {
                default: null,
                rendered: false,
            },
        };
    },
    renderHTML({ node, HTMLAttributes }) {
        const indent = Number(node.attrs.indent ?? 0);
        const blockStyle = node.attrs.blockStyle === 'bullet'
            ? 'bullet'
            : node.attrs.blockStyle === 'quote'
                ? 'quote'
                : node.attrs.blockStyle === 'ordered'
                    ? 'ordered'
                    : node.attrs.blockStyle === 'task'
                        ? 'task'
                    : 'paragraph';
        const order = Math.max(1, Math.floor(Number(node.attrs.order ?? 1) || 1));
        const orderLabel = `${order}.`;
        const orderMarkerWidth = `${Math.max(3, orderLabel.length + 1)}ch`;
        const checked = node.attrs.checked === true;
        const taskStatus = node.attrs.taskStatus ?? null;
        const htmlAttributes: Record<string, string> = {
            ...HTMLAttributes,
            'data-block-tree-node': 'paragraph',
            'data-block-style': blockStyle,
            style: `--bt-indent:${Math.max(0, Math.floor(indent || 0))};${blockStyle === 'ordered' ? `--bt-order-marker-width:${orderMarkerWidth};` : ''}`,
            class: 'bt-paragraph',
        };

        if (indent > 0) {
            htmlAttributes['data-indent'] = String(indent);
        }

        if (blockStyle === 'ordered') {
            htmlAttributes['data-order'] = String(order);
            htmlAttributes['data-order-label'] = orderLabel;
        }

        if (blockStyle === 'task') {
            htmlAttributes['data-checked'] = checked ? 'true' : 'false';
            if (taskStatus !== null) {
                htmlAttributes['data-task-status'] = taskStatus;
            }
            if (typeof node.attrs.dueDate === 'string' && node.attrs.dueDate !== '') {
                htmlAttributes['data-due-date'] = node.attrs.dueDate;
            }
            if (typeof node.attrs.deadlineDate === 'string' && node.attrs.deadlineDate !== '') {
                htmlAttributes['data-deadline-date'] = node.attrs.deadlineDate;
            }
            if (typeof node.attrs.startedAt === 'string' && node.attrs.startedAt !== '') {
                htmlAttributes['data-started-at'] = node.attrs.startedAt;
            }
            if (typeof node.attrs.completedAt === 'string' && node.attrs.completedAt !== '') {
                htmlAttributes['data-completed-at'] = node.attrs.completedAt;
            }
            if (
                typeof node.attrs.backlogPromotedAt === 'string' &&
                node.attrs.backlogPromotedAt !== ''
            ) {
                htmlAttributes['data-backlog-promoted-at'] = node.attrs.backlogPromotedAt;
            }
        }

        return [
            'p',
            htmlAttributes,
            0,
        ];
    },
});

export const BlockHeading = Heading.extend({
    addAttributes() {
        return {
            ...(this.parent?.() ?? {}),
            id: {
                default: null,
                rendered: false,
            },
        };
    },
    renderHTML({ node, HTMLAttributes }) {
        return [
            `h${Number(node.attrs.level ?? 1)}`,
            {
                ...HTMLAttributes,
                'data-block-tree-node': 'heading',
                class: 'bt-heading',
            },
            0,
        ];
    },
});

function insertParagraphAfterCurrentBlock(
    editor: Editor,
    attrs: Record<string, unknown> = normalizeParagraphAttrs({}),
): boolean {
    const current = getCurrentBlockNode(editor);

    if (!current) {
        return false;
    }

    const insertPos = current.pos + current.node.nodeSize;
    const paragraphNode = editor.schema.nodes.paragraph.create(attrs);
    const transaction = editor.state.tr.insert(insertPos, paragraphNode);

    transaction.setSelection(TextSelection.create(transaction.doc, insertPos + 1));
    editor.view.dispatch(transaction.scrollIntoView());

    return true;
}

function createBlockEditingExtension(
    options: CreateSimpleEditorExtensionsOptions = {},
) {
    let longPressTimer: number | null = null;
    const displayLocale = options.language ?? 'en';

    const priorityClassName = (priority: 'normal' | 'medium' | 'high'): string => {
        if (priority === 'high') {
            return 'critical';
        }

        if (priority === 'medium') {
            return 'medium';
        }

        return 'low';
    };

    const clearLongPressTimer = () => {
        if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    };

    return Extension.create({
        name: 'blockEditing',

        addProseMirrorPlugins() {
            return [
                new Plugin({
                    appendTransaction: (_transactions, _oldState, newState) => {
                        return (
                            syncTaskParagraphStatusesFromText(newState) ??
                            syncHeadingBlocksFromText(this.editor, newState)
                        );
                    },
                    props: {
                        decorations: (state) => {
                            const current = getCurrentBlockNodeFromState(state);
                            const currentParagraphPos =
                                current?.type === 'paragraph' ? current.pos : null;
                            const currentHeadingPos =
                                current?.type === 'heading' ? current.pos : null;
                            const decorations: Decoration[] = [];

                            state.doc.descendants((node, pos) => {
                                if (node.isText) {
                                    for (const match of findCompleteRawWikiLinks(node.text ?? '')) {
                                        const from = pos + match.from;
                                        const to = pos + match.to;
                                        const contentFrom = from + 2;
                                        const contentTo = to - 2;

                                        decorations.push(
                                            Decoration.inline(from, contentFrom, {
                                                class: 'md-wikilink-edit-bracket',
                                            }),
                                        );

                                        if (contentTo > contentFrom) {
                                            decorations.push(
                                                Decoration.inline(contentFrom, contentTo, {
                                                    class: 'md-wikilink-edit-content',
                                                }),
                                            );
                                        }

                                        decorations.push(
                                            Decoration.inline(contentTo, to, {
                                                class: 'md-wikilink-edit-bracket',
                                            }),
                                        );
                                    }

                                    for (const range of findBlockInlineTokenRanges(node.text ?? '')) {
                                        decorations.push(
                                            Decoration.inline(pos + range.from, pos + range.to, {
                                                class: range.kind,
                                            }),
                                        );
                                    }

                                    return true;
                                }

                                if (node.type.name === 'heading') {
                                    const prefixLength =
                                        headingTextPrefix(
                                            Math.min(6, Math.max(1, Number(node.attrs.level ?? 1))),
                                        ).length;
                                    const className =
                                        currentHeadingPos === pos
                                            ? 'bt-heading-text-token'
                                            : 'bt-heading-text-token bt-heading-text-token--hidden';

                                    decorations.push(
                                        Decoration.inline(pos + 1, pos + 1 + prefixLength, {
                                            class: className,
                                        }),
                                    );

                                    return true;
                                }

                                if (node.type.name !== 'paragraph') {
                                    return true;
                                }

                                const attrs = normalizeParagraphAttrs(node.attrs);
                                if (attrs.blockStyle === 'task') {
                                    const priority = parseBlockTaskPriority(node.textContent);

                                    if (priority) {
                                        const tokenStart = pos + 1 + priority.tokenStart;
                                        const tokenEnd = pos + 1 + priority.tokenEnd;
                                        const firstTextOffset =
                                            node.textContent.slice(priority.tokenEnd).match(/^\s*/u)?.[0]
                                                .length ?? 0;
                                        const highlightStart = pos + 1 + priority.tokenEnd + firstTextOffset;
                                        const paragraphTextEnd = pos + 1 + node.content.size;
                                        const priorityClass = priorityClassName(priority.priority);
                                        const priorityTokenClassName =
                                            currentParagraphPos === pos
                                                ? `md-priority-token bt-task-priority-token md-priority-token--${priorityClass}`
                                                : `md-priority-token bt-task-priority-token bt-task-priority-token--hidden md-priority-token--${priorityClass}`;

                                        decorations.push(
                                            Decoration.inline(tokenStart, tokenEnd, {
                                                class: priorityTokenClassName,
                                            }),
                                        );

                                        if (paragraphTextEnd > highlightStart) {
                                            decorations.push(
                                                Decoration.inline(highlightStart, paragraphTextEnd, {
                                                    class: `md-priority md-priority--${priorityClass}`,
                                                }),
                                            );
                                        }
                                    }

                                    for (const token of parseBlockTaskDateTokens(node.textContent)) {
                                        const start = pos + 1 + token.start;
                                        const end = pos + 1 + token.end;
                                        const isActive =
                                            state.selection.from <= end && state.selection.to >= start;
                                        const className =
                                            token.prefix === '>>'
                                                ? 'md-task-deadline-token'
                                                : 'md-task-due-token';

                                        if (isActive) {
                                            decorations.push(
                                                Decoration.inline(start, end, {
                                                    class: className,
                                                }),
                                            );

                                            continue;
                                        }

                                        decorations.push(
                                            Decoration.inline(start, end, {
                                                class: `${className} md-task-token-hidden`,
                                            }),
                                        );
                                        decorations.push(
                                            Decoration.widget(
                                                end,
                                                () => {
                                                    const span = document.createElement('span');
                                                    span.className = `${className} md-task-date-display`;
                                                    span.textContent = `${token.prefix}${formatLocalizedDate(
                                                        token.value,
                                                        displayLocale,
                                                    )}`;

                                                    return span;
                                                },
                                                { side: -1 },
                                            ),
                                        );
                                    }
                                }

                                if (attrs.blockStyle !== 'task') {
                                    return true;
                                }

                                const textPrefix = node.textContent.startsWith('? ')
                                    ? '? '
                                    : node.textContent.startsWith('/ ')
                                        ? '/ '
                                        : '';

                                if (textPrefix === '') {
                                    return true;
                                }

                                const className =
                                    currentParagraphPos === pos
                                        ? 'bt-task-status-text-token'
                                        : 'bt-task-status-text-token bt-task-status-text-token--hidden';

                                decorations.push(
                                    Decoration.inline(pos + 1, pos + 1 + textPrefix.length, {
                                        class: className,
                                    }),
                                );

                                return true;
                            });

                            return DecorationSet.create(state.doc, decorations);
                        },
                        handleClickOn: (view, _pos, node, nodePos, event) => {
                        if (node.type.name !== 'paragraph') {
                            return false;
                        }

                        if (event.button !== 0) {
                            return false;
                        }

                        const attrs = normalizeParagraphAttrs(node.attrs);
                        if (attrs.blockStyle !== 'task') {
                            return false;
                        }

                        const paragraphElement = view.nodeDOM(nodePos);
                        if (!(paragraphElement instanceof HTMLElement)) {
                            return false;
                        }

                        const { left: markerLeft, right: markerRight } =
                            getParagraphMarkerBounds(paragraphElement);

                        if (event.clientX < markerLeft || event.clientX > markerRight) {
                            return false;
                        }

                        event.preventDefault();

                        return this.editor.commands.command(({ editor, state, dispatch }) => {
                            return toggleParagraphTaskAtPos(editor, nodePos, state, dispatch);
                        });
                        },
                        handleTextInput: (_view, _from, _to, text) => {
                        const current = this.editor.state.selection.$from.parent;

                        if (
                            text === ' ' &&
                            this.editor.state.selection.$from.parentOffset >= 1
                        ) {
                            if (current.type.name === 'heading') {
                                return false;
                            }

                            if (current.type.name === 'paragraph') {
                                const paragraphPos = this.editor.state.selection.$from.before();
                                const parentOffset = this.editor.state.selection.$from.parentOffset;
                                const headingPrefixOnly = current.textContent.match(/^(#{1,6})$/u);
                                const headingPrefixBeforeText = current.textContent.match(
                                    /^(#{1,6})(\S.*)$/u,
                                );

                                if (
                                    headingPrefixOnly &&
                                    parentOffset === headingPrefixOnly[1].length
                                ) {
                                    const nextLevel = headingPrefixOnly[1].length;
                                    let transaction = this.editor.state.tr.setNodeMarkup(
                                        paragraphPos,
                                        this.editor.schema.nodes.heading,
                                        normalizeHeadingAttrs({ level: nextLevel }),
                                    );

                                    transaction = transaction.insertText(
                                        ' ',
                                        paragraphPos + 1 + nextLevel,
                                    );

                                    this.editor.view.dispatch(transaction);

                                    return true;
                                }

                                if (
                                    headingPrefixBeforeText &&
                                    parentOffset === headingPrefixBeforeText[1].length
                                ) {
                                    const nextLevel = headingPrefixBeforeText[1].length;
                                    let transaction = this.editor.state.tr.setNodeMarkup(
                                        paragraphPos,
                                        this.editor.schema.nodes.heading,
                                        normalizeHeadingAttrs({ level: nextLevel }),
                                    );

                                    transaction = transaction.insertText(
                                        ' ',
                                        paragraphPos + 1 + nextLevel,
                                    );

                                    this.editor.view.dispatch(transaction);

                                    return true;
                                }
                            }

                            if (current.type.name !== 'paragraph') {
                                return false;
                            }

                            const attrs = normalizeParagraphAttrs(current.attrs);
                            const { tr } = this.editor.state;
                            const paragraphPos = this.editor.state.selection.$from.before();
                            const textContent = current.textContent;
                            const marker = textContent.charAt(0);
                            const orderedMatch = textContent.match(/^(\d+)\./u);
                            const parentOffset = this.editor.state.selection.$from.parentOffset;
                            const hasBulletMarker =
                                marker === '-' && parentOffset === 1;
                            const hasTaskMarker =
                                marker === '*' && parentOffset === 1;
                            const hasBacklogTaskMarker =
                                marker === '?' &&
                                parentOffset === 1 &&
                                attrs.blockStyle === 'task' &&
                                detectTaskStatusFromTextPrefix(textContent) === 'backlog';
                            const hasInProgressTaskMarker =
                                marker === '/' &&
                                parentOffset === 1 &&
                                attrs.blockStyle === 'task' &&
                                detectTaskStatusFromTextPrefix(textContent) === 'in_progress';
                            const hasCanceledTaskMarker =
                                marker === '-' &&
                                parentOffset === 1 &&
                                attrs.blockStyle === 'task';
                            const hasQuoteMarker =
                                marker === '>' && parentOffset === 1;
                            const hasOrderedMarker =
                                orderedMatch !== null &&
                                parentOffset === orderedMatch[0].length;

                            if (
                                !hasBulletMarker &&
                                !hasTaskMarker &&
                                !hasBacklogTaskMarker &&
                                !hasInProgressTaskMarker &&
                                !hasCanceledTaskMarker &&
                                !hasQuoteMarker &&
                                !hasOrderedMarker
                            ) {
                                return false;
                            }

                            const nextBlockStyle =
                                hasQuoteMarker
                                    ? 'quote'
                                    : hasOrderedMarker
                                        ? 'ordered'
                                        : hasTaskMarker || hasBacklogTaskMarker || hasInProgressTaskMarker || hasCanceledTaskMarker
                                            ? 'task'
                                            : 'bullet';
                            const nextTaskStatus =
                                hasBacklogTaskMarker
                                    ? 'backlog'
                                    : hasInProgressTaskMarker
                                        ? 'in_progress'
                                        : hasCanceledTaskMarker
                                            ? 'canceled'
                                            : null;
                            const nextOrder = hasOrderedMarker
                                ? Math.max(1, Math.floor(Number(orderedMatch[1]) || 1))
                                : 1;
                            const markerLength =
                                hasOrderedMarker
                                    ? orderedMatch[0].length
                                    : hasBacklogTaskMarker || hasInProgressTaskMarker
                                        ? 0
                                        : 1;

                            let transaction = tr.setNodeMarkup(paragraphPos, undefined, {
                                ...attrs,
                                blockStyle: nextBlockStyle,
                                order: nextOrder,
                                checked: nextBlockStyle === 'task' ? false : attrs.checked === true,
                                taskStatus: nextBlockStyle === 'task' ? nextTaskStatus : null,
                            });
                            if (markerLength > 0) {
                                transaction = transaction.delete(
                                    paragraphPos + 1,
                                    paragraphPos + 1 + markerLength,
                                );
                            }

                            this.editor.view.dispatch(transaction);

                            return true;
                        }
 
                        return false;
                        },
                        handleDOMEvents: {
                        keydown: (_view, event) => {
                            if (event.key !== 'Enter') {
                                return false;
                            }

                            if (event.shiftKey) {
                                return false;
                            }

                            const current = this.editor.state.selection.$from.parent;

                            if (current.type.name === 'heading') {
                                if (!isAtEndOfCurrentBlock(this.editor)) {
                                    return false;
                                }

                                event.preventDefault();
                                event.stopPropagation();

                                insertParagraphAfterCurrentBlock(
                                    this.editor,
                                    normalizeParagraphAttrs({}),
                                );

                                return true;
                            }

                            if (current.type.name !== 'paragraph') {
                                return false;
                            }

                            const attrs = normalizeParagraphAttrs(current.attrs);

                            if (
                                attrs.blockStyle !== 'bullet' &&
                                attrs.blockStyle !== 'quote' &&
                                attrs.blockStyle !== 'ordered' &&
                                attrs.blockStyle !== 'task'
                            ) {
                                return false;
                            }

                            event.preventDefault();
                            event.stopPropagation();

                            if (current.textContent.trim() === '') {
                                this.editor
                                    .chain()
                                    .focus()
                                    .setNode('paragraph', {
                                        ...attrs,
                                        blockStyle: 'paragraph',
                                        order: 1,
                                        checked: false,
                                        taskStatus: null,
                                        dueDate: null,
                                        deadlineDate: null,
                                    })
                                    .run();

                                return true;
                            }

                            if (!isAtEndOfCurrentBlock(this.editor)) {
                                this.editor
                                    .chain()
                                    .focus()
                                    .splitBlock()
                                    .setNode('paragraph', {
                                        ...attrs,
                                        order:
                                            attrs.blockStyle === 'ordered'
                                                ? Math.max(
                                                    1,
                                                    Math.floor(Number(attrs.order ?? 1) || 1) + 1,
                                                )
                                                : 1,
                                        checked: false,
                                        taskStatus: attrs.blockStyle === 'task' ? null : null,
                                        dueDate: null,
                                        deadlineDate: null,
                                        startedAt: null,
                                        completedAt: null,
                                        backlogPromotedAt: null,
                                    })
                                    .run();

                                return true;
                            }

                            insertParagraphAfterCurrentBlock(this.editor, {
                                ...attrs,
                                order:
                                    attrs.blockStyle === 'ordered'
                                        ? Math.max(
                                            1,
                                            Math.floor(Number(attrs.order ?? 1) || 1) + 1,
                                        )
                                        : 1,
                                checked: false,
                                taskStatus: attrs.blockStyle === 'task' ? null : null,
                                dueDate: null,
                                deadlineDate: null,
                                startedAt: null,
                                completedAt: null,
                                backlogPromotedAt: null,
                            });

                            return true;
                        },
                        pointerdown: (view, event) => {
                            clearLongPressTimer();

                            if (event.pointerType !== 'touch') {
                                return false;
                            }

                            const target = event.target;
                            if (!(target instanceof HTMLElement)) {
                                return false;
                            }

                            const paragraphElement = target.closest('p.bt-paragraph[data-block-style="task"]');
                            if (!(paragraphElement instanceof HTMLElement)) {
                                return false;
                            }

                            const paragraphPos = view.posAtDOM(paragraphElement, 0);
                            const node = this.editor.state.doc.nodeAt(paragraphPos);
                            if (!node || node.type.name !== 'paragraph') {
                                return false;
                            }

                            const attrs = normalizeParagraphAttrs(node.attrs);
                            if (attrs.blockStyle !== 'task') {
                                return false;
                            }

                            const { left: markerLeft, right: markerRight } =
                                getParagraphMarkerBounds(paragraphElement);

                            if (event.clientX < markerLeft || event.clientX > markerRight) {
                                return false;
                            }

                            longPressTimer = window.setTimeout(() => {
                                options.onBlockTaskStatusMenuRequest?.({
                                    x: event.clientX,
                                    y: event.clientY,
                                    pos: paragraphPos,
                                    status: attrs.taskStatus ?? null,
                                });
                                longPressTimer = null;
                            }, 450);

                            return false;
                        },
                        pointerup: () => {
                            clearLongPressTimer();
                            return false;
                        },
                        pointercancel: () => {
                            clearLongPressTimer();
                            return false;
                        },
                    },
                    },
                }),
            ];
        },

        addCommands() {
            return {
                indentBlockParagraph:
                    () =>
                    ({ editor, state, dispatch }) => indentCurrentParagraph(editor, state, dispatch),
                dedentBlockParagraph:
                    () =>
                    ({ editor, state, dispatch }) => dedentCurrentParagraph(editor, state, dispatch),
            };
        },

        addKeyboardShortcuts() {
            return {
                Tab: () => {
                    return this.editor.commands.command(({ editor, state, dispatch }) => {
                        return indentCurrentParagraph(editor, state, dispatch);
                    });
                },
                'Shift-Tab': () => {
                    return this.editor.commands.command(({ editor, state, dispatch }) => {
                        return dedentCurrentParagraph(editor, state, dispatch);
                    });
                },
                Backspace: () => {
                    if (!isAtStartOfCurrentBlock(this.editor)) {
                        return false;
                    }

                    if (this.editor.state.selection.$from.parent.type.name === 'heading') {
                        return this.editor.commands.command(({ editor, state, dispatch }) => {
                            return decreaseCurrentHeadingLevel(editor, state, dispatch);
                        });
                    }

                    return this.editor.commands.command(({ editor, state, dispatch }) => {
                        return removeParagraphStyleOrDedentCurrentParagraph(editor, state, dispatch);
                    });
                },
            };
        },

        onCreate() {
            const editor = this.editor;
            const { doc } = editor.state;
            let transaction = editor.state.tr;
            let changed = false;

            doc.descendants((node, pos) => {
                if (node.type.name === 'paragraph') {
                    const attrs = normalizeParagraphAttrs(node.attrs);
                    if (JSON.stringify(attrs) !== JSON.stringify(node.attrs)) {
                        transaction = transaction.setNodeMarkup(pos, undefined, attrs);
                        changed = true;
                    }
                }

                if (node.type.name === 'heading') {
                    const attrs = normalizeHeadingAttrs(node.attrs);
                    if (JSON.stringify(attrs) !== JSON.stringify(node.attrs)) {
                        transaction = transaction.setNodeMarkup(pos, undefined, attrs);
                        changed = true;
                    }
                }

                return true;
            });

            const normalizedHeadingTransaction = normalizeHeadingPrefixesFromAttrs(editor.state);
            if (normalizedHeadingTransaction) {
                transaction = normalizedHeadingTransaction;
                changed = true;
            }

            if (changed) {
                editor.view.dispatch(transaction);
            }
        },
    });
}

export function createBlockTreeItemExtensions(
    options: CreateSimpleEditorExtensionsOptions = {},
) {
    return [
        BlockParagraph,
        BlockHeading,
        createBlockEditingExtension(options),
    ] as const;
}
