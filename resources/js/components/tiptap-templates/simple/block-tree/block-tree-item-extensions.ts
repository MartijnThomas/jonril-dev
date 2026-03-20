import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Heading } from '@tiptap/extension-heading';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
    findDateGhostSuffix,
    findDateHelperBeforeCursor,
    resolveDateKeyword,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-date-helpers';
import { findBlockInlineTokenRanges } from '@/components/tiptap-templates/simple/block-tree/block-tree-inline-tokens';
import {
    formatLocalizedDate,
    detectTaskStatusFromTextPrefix,
    getParagraphMarkerBounds,
    getCurrentBlockNode,
    getCurrentBlockNodeFromState,
    convertCurrentHeadingToParagraph,
    dedentCurrentParagraph,
    decreaseCurrentHeadingLevel,
    indentCurrentParagraph,
    isAtEndOfCurrentBlock,
    isAtStartOfCurrentBlock,
    normalizeHeadingAttrs,
    normalizeParagraphAttrs,
    parseBlockTaskDateTokens,
    parseBlockTaskPriority,
    removeParagraphStyleOrDedentCurrentParagraph,
    setParagraphCheckedAtPos,
    toggleParagraphTaskAtPos,
    syncTaskParagraphStatusesFromText,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { findCompleteRawWikiLinks } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';
import type { CreateBlockTreeEditorExtensionsOptions } from '@/components/tiptap-templates/simple/block-tree-editor-extension-options';

declare global {
    interface Window {
        __sarthBlockWikiLinkSuggestionActive?: boolean;
        __sarthBlockWikiLinkEnterHandledAt?: number;
    }
}

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
            assignee: {
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
            canceledAt: {
                default: null,
                rendered: false,
            },
            backlogPromotedAt: {
                default: null,
                rendered: false,
            },
            migratedAt: {
                default: null,
                rendered: false,
            },
            migratedToNoteId: {
                default: null,
                rendered: false,
            },
            migratedFromNoteId: {
                default: null,
                rendered: false,
            },
            migratedFromBlockId: {
                default: null,
                rendered: false,
            },
        };
    },
    parseHTML() {
        return [
            {
                tag: 'p[data-block-tree-node="paragraph"]',
                getAttrs: (element) => {
                    if (typeof element === 'string') {
                        return {};
                    }

                    const el = element as HTMLElement;

                    return {
                        blockStyle: el.getAttribute('data-block-style') ?? 'paragraph',
                        indent: parseInt(el.getAttribute('data-indent') ?? '0', 10) || 0,
                        order: parseInt(el.getAttribute('data-order') ?? '1', 10) || 1,
                        checked: el.getAttribute('data-checked') === 'true',
                        taskStatus: el.getAttribute('data-task-status') ?? null,
                        assignee: el.getAttribute('data-assignee') ?? null,
                        dueDate: el.getAttribute('data-due-date') ?? null,
                        deadlineDate: el.getAttribute('data-deadline-date') ?? null,
                        startedAt: el.getAttribute('data-started-at') ?? null,
                        completedAt: el.getAttribute('data-completed-at') ?? null,
                        canceledAt: el.getAttribute('data-canceled-at') ?? null,
                        backlogPromotedAt: el.getAttribute('data-backlog-promoted-at') ?? null,
                        // Deliberately omit: id, migratedAt, migratedToNoteId, migratedFromNoteId,
                        // migratedFromBlockId — these are note-specific and must not be copied.
                    };
                },
            },
            { tag: 'p' },
        ];
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
                        : node.attrs.blockStyle === 'checklist'
                            ? 'checklist'
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

        if (blockStyle === 'task' || blockStyle === 'checklist') {
            htmlAttributes['data-checked'] = checked ? 'true' : 'false';
        }

        if (blockStyle === 'task') {
            if (typeof node.attrs.id === 'string' && node.attrs.id.trim() !== '') {
                htmlAttributes.id = node.attrs.id;
            }
            if (taskStatus !== null) {
                htmlAttributes['data-task-status'] = taskStatus;
            }
            if (typeof node.attrs.assignee === 'string' && node.attrs.assignee !== '') {
                htmlAttributes['data-assignee'] = node.attrs.assignee;
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
            if (typeof node.attrs.canceledAt === 'string' && node.attrs.canceledAt !== '') {
                htmlAttributes['data-canceled-at'] = node.attrs.canceledAt;
            }
            if (
                typeof node.attrs.backlogPromotedAt === 'string' &&
                node.attrs.backlogPromotedAt !== ''
            ) {
                htmlAttributes['data-backlog-promoted-at'] = node.attrs.backlogPromotedAt;
            }
            if (typeof node.attrs.migratedAt === 'string' && node.attrs.migratedAt !== '') {
                htmlAttributes['data-migrated-at'] = node.attrs.migratedAt;
            }
            if (
                typeof node.attrs.migratedToNoteId === 'string' &&
                node.attrs.migratedToNoteId !== ''
            ) {
                htmlAttributes['data-migrated-to-note-id'] = node.attrs.migratedToNoteId;
            }
            if (
                typeof node.attrs.migratedFromNoteId === 'string' &&
                node.attrs.migratedFromNoteId !== ''
            ) {
                htmlAttributes['data-migrated-from-note-id'] = node.attrs.migratedFromNoteId;
            }
            if (
                typeof node.attrs.migratedFromBlockId === 'string' &&
                node.attrs.migratedFromBlockId !== ''
            ) {
                htmlAttributes['data-migrated-from-block-id'] = node.attrs.migratedFromBlockId;
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
        const htmlAttributes: Record<string, string> = {
            ...HTMLAttributes,
            'data-block-tree-node': 'heading',
            class: 'bt-heading',
        };

        if (typeof node.attrs.id === 'string' && node.attrs.id.trim() !== '') {
            htmlAttributes.id = node.attrs.id;
        }

        return [
            `h${Number(node.attrs.level ?? 1)}`,
            htmlAttributes,
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

function syncParagraphBulletMarkers(state: any) {
    const paragraphsToNormalize: number[] = [];

    state.doc.descendants((node: any, pos: number) => {
        if (node.type.name !== 'paragraph') {
            return true;
        }

        const attrs = normalizeParagraphAttrs(node.attrs);
        if (attrs.blockStyle === 'task' || attrs.blockStyle === 'checklist') {
            return true;
        }

        if (!node.textContent.startsWith('- ')) {
            return true;
        }

        paragraphsToNormalize.push(pos);

        return true;
    });

    if (paragraphsToNormalize.length === 0) {
        return null;
    }

    let transaction = state.tr;

    for (const paragraphPos of [...paragraphsToNormalize].reverse()) {
        const currentNode = transaction.doc.nodeAt(paragraphPos);
        if (!currentNode || currentNode.type.name !== 'paragraph') {
            continue;
        }

        if (!currentNode.textContent.startsWith('- ')) {
            continue;
        }

        const attrs = normalizeParagraphAttrs(currentNode.attrs);
        transaction = transaction
            .setNodeMarkup(paragraphPos, undefined, {
                ...attrs,
                blockStyle: 'bullet',
                order: 1,
                checked: false,
                taskStatus: null,
            })
            .delete(paragraphPos + 1, paragraphPos + 3);
    }

    return transaction.docChanged ? transaction : null;
}

function createBlockEditingExtension(
    options: CreateBlockTreeEditorExtensionsOptions = {},
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
                        const bulletSyncTransaction = syncParagraphBulletMarkers(newState);
                        if (bulletSyncTransaction) {
                            return bulletSyncTransaction;
                        }

                        return syncTaskParagraphStatusesFromText(newState);
                    },
                    props: {
                        decorations: (state) => {
                            const current = getCurrentBlockNodeFromState(state);
                            const currentParagraphPos =
                                current?.type === 'paragraph' ? current.pos : null;
                            const currentHeadingPos =
                                current?.type === 'heading' ? current.pos : null;
                            const isEditorFocused = this.editor.isFocused;
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
                                        const rangeFrom = pos + range.from;
                                        const rangeTo = pos + range.to;
                                        const selectionInsideRange =
                                            state.selection.empty &&
                                            state.selection.from >= rangeFrom &&
                                            state.selection.from <= rangeTo;

                                        if (selectionInsideRange) {
                                            continue;
                                        }

                                        decorations.push(
                                            Decoration.inline(rangeFrom, rangeTo, {
                                                class: range.kind,
                                            }),
                                        );
                                    }

                                    return true;
                                }

                                if (node.type.name === 'heading' || node.type.name !== 'paragraph') {
                                    return true;
                                }

                                const attrs = normalizeParagraphAttrs(node.attrs);
                                if (
                                    attrs.blockStyle === 'task' ||
                                    attrs.blockStyle === 'checklist' ||
                                    attrs.blockStyle === 'bullet' ||
                                    attrs.blockStyle === 'ordered'
                                ) {
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
                                            currentParagraphPos === pos && isEditorFocused
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
                                }

                                if (attrs.blockStyle === 'task') {
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

                                const textPrefixMatch = node.textContent.match(
                                    /^(?:\?\s|\/\s|\*\s|(?:-|—)\s|<\s)/u,
                                );
                                const textPrefix = textPrefixMatch?.[0] ?? '';

                                if (textPrefix === '') {
                                    return true;
                                }

                                const className =
                                    currentParagraphPos === pos && isEditorFocused
                                        ? 'bt-task-status-text-token'
                                        : 'bt-task-status-text-token bt-task-status-text-token--hidden';

                                decorations.push(
                                    Decoration.inline(pos + 1, pos + 1 + textPrefix.length, {
                                        class: className,
                                    }),
                                );

                                return true;
                            });

                            // Ghost suggestion for date keywords in task blocks
                            const { from: selFrom, to: selTo } = state.selection;
                            if (selFrom === selTo && isEditorFocused) {
                                const $cur = state.selection.$from;
                                if ($cur.parent.type.name === 'paragraph') {
                                    const curAttrs = normalizeParagraphAttrs($cur.parent.attrs);
                                    if (curAttrs.blockStyle === 'task') {
                                        const textBefore = $cur.parent.textContent.slice(0, $cur.parentOffset);
                                        const ghost = findDateGhostSuffix(textBefore);
                                        if (ghost) {
                                            decorations.push(
                                                Decoration.widget(selFrom, () => {
                                                    const span = document.createElement('span');
                                                    span.className = 'inline-command-ghost';
                                                    span.textContent = ghost;
                                                    return span;
                                                }, { side: 1 }),
                                            );
                                        }
                                    }
                                }
                            }

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
                        if (attrs.blockStyle !== 'task' && attrs.blockStyle !== 'checklist') {
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

                        if (attrs.blockStyle === 'task') {
                            return this.editor.commands.command(({ editor, state, dispatch }) => {
                                return toggleParagraphTaskAtPos(editor, nodePos, state, dispatch);
                            });
                        }

                        return this.editor.commands.command(({ editor, state, dispatch }) => {
                            return setParagraphCheckedAtPos(
                                editor,
                                nodePos,
                                attrs.checked !== true,
                                state,
                                dispatch,
                            );
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

                            // Date keyword expansion for task paragraphs (>keyword → >yyyy-mm-dd)
                            if (current.type.name === 'paragraph') {
                                const taskAttrs = normalizeParagraphAttrs(current.attrs);
                                if (taskAttrs.blockStyle === 'task') {
                                    const $from = this.editor.state.selection.$from;
                                    const textBefore = current.textContent.slice(0, $from.parentOffset);
                                    const dateMatch = findDateHelperBeforeCursor(textBefore);
                                    if (dateMatch) {
                                        const resolved = resolveDateKeyword(dateMatch.keyword);
                                        if (resolved) {
                                            const blockStart = $from.before();
                                            const keywordFrom = blockStart + 1 + dateMatch.matchStart;
                                            const keywordTo = blockStart + 1 + dateMatch.matchStart + dateMatch.matchLength;
                                            const replacement = `${dateMatch.prefix}${resolved} `;
                                            this.editor.view.dispatch(
                                                this.editor.state.tr.insertText(replacement, keywordFrom, keywordTo),
                                            );
                                            return true;
                                        }
                                    }
                                }
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

                                    // Delete the # characters — heading text should be clean
                                    transaction = transaction.delete(
                                        paragraphPos + 1,
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

                                    // Delete the # characters — heading text should be clean
                                    transaction = transaction.delete(
                                        paragraphPos + 1,
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
                            const hasChecklistMarker =
                                marker === '+' &&
                                parentOffset === 1 &&
                                attrs.blockStyle !== 'task';
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
                            const hasStarredTaskMarker =
                                marker === '*' &&
                                parentOffset === 1 &&
                                attrs.blockStyle === 'task' &&
                                detectTaskStatusFromTextPrefix(textContent) === 'starred';
                            const hasDeferredTaskMarker =
                                marker === '<' &&
                                parentOffset === 1 &&
                                attrs.blockStyle === 'task' &&
                                detectTaskStatusFromTextPrefix(textContent) === 'deferred';
                            const hasCanceledTaskMarker =
                                (marker === '-' || marker === '—') &&
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
                                !hasChecklistMarker &&
                                !hasBacklogTaskMarker &&
                                !hasInProgressTaskMarker &&
                                !hasStarredTaskMarker &&
                                !hasDeferredTaskMarker &&
                                !hasCanceledTaskMarker &&
                                !hasQuoteMarker &&
                                !hasOrderedMarker
                            ) {
                                return false;
                            }

                            // Let "- " flow as normal text input in tasks.
                            // Status is inferred by appendTransaction sync.
                            if (hasCanceledTaskMarker) {
                                return false;
                            }

                            const nextBlockStyle =
                                hasQuoteMarker
                                    ? 'quote'
                                    : hasOrderedMarker
                                        ? 'ordered'
                                        : hasChecklistMarker
                                            ? 'checklist'
                                            : hasTaskMarker ||
                                                    hasBacklogTaskMarker ||
                                                    hasInProgressTaskMarker ||
                                                    hasStarredTaskMarker ||
                                                    hasDeferredTaskMarker ||
                                                    hasCanceledTaskMarker
                                                ? 'task'
                                            : 'bullet';
                            const nextTaskStatus =
                                hasBacklogTaskMarker
                                    ? 'backlog'
                                    : hasInProgressTaskMarker
                                        ? 'in_progress'
                                        : hasTaskMarker || hasStarredTaskMarker
                                            ? 'starred'
                                        : hasDeferredTaskMarker
                                            ? 'deferred'
                                        : hasCanceledTaskMarker
                                            ? 'canceled'
                                            : null;
                            const nextOrder = hasOrderedMarker
                                ? Math.max(1, Math.floor(Number(orderedMatch[1]) || 1))
                                : 1;
                            const markerLength =
                                hasOrderedMarker
                                    ? orderedMatch[0].length
                                    : hasBacklogTaskMarker ||
                                            hasInProgressTaskMarker ||
                                            hasStarredTaskMarker ||
                                            hasDeferredTaskMarker ||
                                            hasCanceledTaskMarker
                                        ? 0
                                        : 1;

                            let transaction = tr.setNodeMarkup(paragraphPos, undefined, {
                                ...attrs,
                                blockStyle: nextBlockStyle,
                                order: nextOrder,
                                checked:
                                    nextBlockStyle === 'task' || nextBlockStyle === 'checklist'
                                        ? false
                                        : attrs.checked === true,
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
                            if (event.defaultPrevented) {
                                return false;
                            }

                            if (
                                event.key === 'Enter' &&
                                (Date.now() - (window.__sarthBlockWikiLinkEnterHandledAt ?? 0) <
                                    250 ||
                                    window.__sarthBlockWikiLinkSuggestionActive ||
                                    document.querySelector('[data-block-wiki-link-suggestion="true"]'))
                            ) {
                                return false;
                            }

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
                                attrs.blockStyle !== 'task' &&
                                attrs.blockStyle !== 'checklist'
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
                                        assignee: null,
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
                                        id: null,
                                        order:
                                            attrs.blockStyle === 'ordered'
                                                ? Math.max(
                                                    1,
                                                    Math.floor(Number(attrs.order ?? 1) || 1) + 1,
                                                )
                                                : 1,
                                        checked: false,
                                        taskStatus: attrs.blockStyle === 'task' ? null : null,
                                        assignee: null,
                                        dueDate: null,
                                        deadlineDate: null,
                                        startedAt: null,
                                        completedAt: null,
                                        backlogPromotedAt: null,
                                        migratedAt: null,
                                        migratedToNoteId: null,
                                        migratedFromNoteId: null,
                                        migratedFromBlockId: null,
                                    })
                                    .run();

                                return true;
                            }

                            insertParagraphAfterCurrentBlock(this.editor, {
                                ...attrs,
                                id: null,
                                order:
                                    attrs.blockStyle === 'ordered'
                                        ? Math.max(
                                            1,
                                            Math.floor(Number(attrs.order ?? 1) || 1) + 1,
                                        )
                                        : 1,
                                checked: false,
                                taskStatus: attrs.blockStyle === 'task' ? null : null,
                                assignee: null,
                                dueDate: null,
                                deadlineDate: null,
                                startedAt: null,
                                completedAt: null,
                                backlogPromotedAt: null,
                                migratedAt: null,
                                migratedToNoteId: null,
                                migratedFromNoteId: null,
                                migratedFromBlockId: null,
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

                            const paragraphElement = target.closest(
                                'p.bt-paragraph[data-block-style="task"], p.bt-paragraph[data-block-style="checklist"]',
                            );
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
                                window.dispatchEvent(
                                    new CustomEvent('block-task-status-menu:open', {
                                        detail: {
                                            x: event.clientX,
                                            y: event.clientY,
                                            pos: paragraphPos,
                                            status: attrs.taskStatus ?? null,
                                        },
                                    }),
                                );
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
                    const { $from } = this.editor.state.selection;
                    const parentText = $from.parent.textContent ?? '';
                    const beforeCursor = parentText.slice(0, $from.parentOffset);

                    // Complete date ghost suggestion if present in a task block
                    if ($from.parent.type.name === 'paragraph') {
                        const tabAttrs = normalizeParagraphAttrs($from.parent.attrs);
                        if (tabAttrs.blockStyle === 'task') {
                            const ghost = findDateGhostSuffix(beforeCursor);
                            if (ghost) {
                                this.editor.view.dispatch(
                                    this.editor.state.tr.insertText(ghost, $from.pos),
                                );
                                return true;
                            }
                        }
                    }

                    if (/\/[^\s]*$/u.test(beforeCursor)) {
                        return false;
                    }

                    return this.editor.commands.command(({ editor, state, dispatch }) => {
                        return indentCurrentParagraph(editor, state, dispatch);
                    });
                },
                'Shift-Tab': () => {
                    const { $from } = this.editor.state.selection;
                    const parentText = $from.parent.textContent ?? '';
                    const beforeCursor = parentText.slice(0, $from.parentOffset);
                    if (/\/[^\s]*$/u.test(beforeCursor)) {
                        return false;
                    }

                    return this.editor.commands.command(({ editor, state, dispatch }) => {
                        return dedentCurrentParagraph(editor, state, dispatch);
                    });
                },
                Backspace: () => {
                    if (!isAtStartOfCurrentBlock(this.editor)) {
                        return false;
                    }

                    const { $from } = this.editor.state.selection;
                    const isInHeading = $from.parent.type.name === 'heading';

                    if (isInHeading) {
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

            if (changed) {
                editor.view.dispatch(transaction);
            }
        },
    });
}

export function createBlockTreeItemExtensions(
    options: CreateBlockTreeEditorExtensionsOptions = {},
) {
    return [
        BlockParagraph,
        BlockHeading,
        createBlockEditingExtension(options),
    ] as const;
}
