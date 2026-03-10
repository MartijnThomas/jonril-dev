import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import type { TaskPriority } from '@/components/tiptap-extension/list-item-with-priority-extension';

type PriorityTokenMatch = {
    priority: Exclude<TaskPriority, null>;
    tokenStart: number;
    tokenEnd: number;
};

const PRIORITY_SYNC_INIT_META = 'priority-sync-init';

const PRIORITY_TOKEN_REGEX = /^(\s*)(!{1,3})(?=\s|$)/;

function priorityFromToken(token: string): Exclude<TaskPriority, null> {
    if (token === '!!!') {
        return 'high';
    }

    if (token === '!!') {
        return 'medium';
    }

    return 'normal';
}

function tokenMatchForText(text: string): PriorityTokenMatch | null {
    const match = PRIORITY_TOKEN_REGEX.exec(text);
    if (!match) {
        return null;
    }

    const leading = match[1] ?? '';
    const token = match[2] ?? '';

    if (token === '') {
        return null;
    }

    const tokenStart = leading.length;
    const tokenEnd = tokenStart + token.length;

    return {
        priority: priorityFromToken(token),
        tokenStart,
        tokenEnd,
    };
}

function extractPriorityFromListItem(node: any): TaskPriority {
    let result: TaskPriority = null;
    let done = false;

    node.descendants((child: any) => {
        if (done) {
            return false;
        }

        if (
            child.type?.name === 'taskList' ||
            child.type?.name === 'bulletList' ||
            child.type?.name === 'orderedList'
        ) {
            return false;
        }

        if (!child.isText || !child.text) {
            return;
        }

        const match = tokenMatchForText(child.text as string);
        result = match?.priority ?? null;
        done = true;

        return false;
    });

    return result;
}

function priorityColor(priority: Exclude<TaskPriority, null>): string {
    if (priority === 'high') {
        return 'rgba(248, 113, 113, 0.16)';
    }

    if (priority === 'medium') {
        return 'rgba(251, 146, 60, 0.16)';
    }

    return 'rgba(250, 204, 21, 0.18)';
}

function findFirstParagraph(node: any): { node: any; pos: number } | null {
    let paragraphNode: any | null = null;
    let paragraphPos = -1;

    node.descendants((child: any, childPos: number) => {
        if (
            child.type?.name === 'taskList' ||
            child.type?.name === 'bulletList' ||
            child.type?.name === 'orderedList'
        ) {
            return false;
        }

        if (child.type?.name === 'paragraph') {
            paragraphNode = child;
            paragraphPos = childPos;
            return false;
        }
    });

    if (!paragraphNode || paragraphPos < 0) {
        return null;
    }

    return { node: paragraphNode, pos: paragraphPos };
}

function findPriorityTextRange(
    listItemPos: number,
    paragraphNode: any,
    paragraphPos: number,
): {
    priority: Exclude<TaskPriority, null>;
    textFrom: number;
    textTo: number;
} | null {
    let result: {
        priority: Exclude<TaskPriority, null>;
        textFrom: number;
        textTo: number;
    } | null = null;

    paragraphNode.descendants((child: any, childPos: number) => {
        if (result || !child.isText || !child.text) {
            return;
        }

        const match = tokenMatchForText(child.text as string);
        if (!match) {
            return false;
        }

        const textStartBase = listItemPos + 1 + paragraphPos + 1 + childPos;
        const tokenStartAbsolute = textStartBase + match.tokenStart;
        let localTextOffset = match.tokenEnd;
        const text = child.text as string;
        while (text.charAt(localTextOffset) === ' ') {
            localTextOffset += 1;
        }
        const textFrom = textStartBase + localTextOffset;

        const paragraphContentEnd =
            listItemPos + 1 + paragraphPos + paragraphNode.nodeSize - 1;

        if (paragraphContentEnd > tokenStartAbsolute && paragraphContentEnd >= textFrom) {
            result = {
                priority: match.priority,
                textFrom,
                textTo: paragraphContentEnd,
            };
        }

        return false;
    });

    return result;
}

function clearPriorityHighlightMarks(
    tr: any,
    from: number,
    to: number,
    highlightType: any,
) {
    if (to <= from) {
        return;
    }

    const colors = [
        priorityColor('normal'),
        priorityColor('medium'),
        priorityColor('high'),
    ];

    for (const color of colors) {
        tr.removeMark(from, to, highlightType.create({ color }));
    }
}

function buildActiveMarkerNodeDecorations(
    doc: any,
    selectionFrom: number,
): DecorationSet {
    const decorations: Decoration[] = [];
    const resolved = doc.resolve(selectionFrom);

    for (let depth = resolved.depth; depth >= 0; depth -= 1) {
        const node = resolved.node(depth);
        if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
            continue;
        }

        const pos = resolved.before(depth);
        decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
                class: 'md-marker-active',
            }),
        );
        break;
    }

    return DecorationSet.create(doc, decorations);
}

function buildPriorityTokenDecorations(doc: any): DecorationSet {
    const decorations: Decoration[] = [];

    doc.descendants((node: any, pos: number) => {
        if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
            return;
        }

        let applied = false;

        node.descendants((child: any, childPos: number) => {
            if (applied) {
                return false;
            }

            if (
                child.type?.name === 'taskList' ||
                child.type?.name === 'bulletList' ||
                child.type?.name === 'orderedList'
            ) {
                return false;
            }

            if (!child.isText || !child.text) {
                return;
            }

            const match = tokenMatchForText(child.text as string);
            if (!match) {
                applied = true;
                return false;
            }

            const absoluteStart = pos + 1 + childPos + match.tokenStart;
            let absoluteEnd = pos + 1 + childPos + match.tokenEnd;

            decorations.push(
                Decoration.inline(absoluteStart, absoluteEnd, {
                    class: `md-priority-token md-priority-token--${match.priority}`,
                }),
            );

            const text = child.text as string;
            let separatorOffset = match.tokenEnd;
            while (text.charAt(separatorOffset) === ' ') {
                absoluteEnd += 1;
                separatorOffset += 1;
            }

            if (absoluteEnd > pos + 1 + childPos + match.tokenEnd) {
                decorations.push(
                    Decoration.inline(
                        pos + 1 + childPos + match.tokenEnd,
                        absoluteEnd,
                        {
                            class: 'md-task-marker-separator md-priority-separator',
                        },
                    ),
                );
            }

            applied = true;
            return false;
        });
    });

    return DecorationSet.create(doc, decorations);
}

export const ListItemPriorityExtension = Extension.create({
    name: 'listItemPriorityExtension',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                state: {
                    init: (_, state) => buildPriorityTokenDecorations(state.doc),
                    apply: (tr, decorationSet) => {
                        if (!tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildPriorityTokenDecorations(tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
            new Plugin({
                state: {
                    init: (_, state) =>
                        buildActiveMarkerNodeDecorations(
                            state.doc,
                            state.selection.from,
                        ),
                    apply: (tr, decorationSet, _oldState, newState) => {
                        if (!tr.docChanged && !tr.selectionSet) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildActiveMarkerNodeDecorations(
                            newState.doc,
                            newState.selection.from,
                        );
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
            new Plugin({
                appendTransaction: (transactions, oldState, newState) => {
                    if (
                        !transactions.some(
                            (transaction) =>
                                transaction.docChanged ||
                                transaction.getMeta(PRIORITY_SYNC_INIT_META),
                        )
                    ) {
                        return null;
                    }

                    if (
                        oldState.doc.eq(newState.doc) &&
                        !transactions.some((transaction) =>
                            transaction.getMeta(PRIORITY_SYNC_INIT_META),
                        )
                    ) {
                        return null;
                    }

                    const { tr } = newState;
                    let changed = false;
                    const highlightType = newState.schema.marks.highlight;

                    newState.doc.descendants((node, pos) => {
                        if (
                            node.type.name !== 'listItem' &&
                            node.type.name !== 'taskItem'
                        ) {
                            return;
                        }

                        const nextPriority = extractPriorityFromListItem(node);
                        const currentPriority = (node.attrs.priority ?? null) as TaskPriority;
                        const firstParagraph = findFirstParagraph(node);

                        if (highlightType && firstParagraph) {
                            const paragraphFrom = pos + 1 + firstParagraph.pos + 1;
                            const paragraphTo =
                                pos + 1 + firstParagraph.pos + firstParagraph.node.nodeSize - 1;

                            clearPriorityHighlightMarks(
                                tr,
                                paragraphFrom,
                                paragraphTo,
                                highlightType,
                            );

                            if (nextPriority) {
                                const priorityRange = findPriorityTextRange(
                                    pos,
                                    firstParagraph.node,
                                    firstParagraph.pos,
                                );

                                if (
                                    priorityRange &&
                                    priorityRange.textTo > priorityRange.textFrom
                                ) {
                                    tr.addMark(
                                        priorityRange.textFrom,
                                        priorityRange.textTo,
                                        highlightType.create({
                                            color: priorityColor(nextPriority),
                                        }),
                                    );
                                    changed = true;
                                }
                            }
                        }

                        if (currentPriority === nextPriority) {
                            return;
                        }

                        tr.setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            priority: nextPriority,
                        });
                        changed = true;
                    });

                    return changed ? tr : null;
                },

                view: (view) => {
                    const trigger = () => {
                        if (view.isDestroyed) {
                            return;
                        }

                        view.dispatch(
                            view.state.tr.setMeta(PRIORITY_SYNC_INIT_META, true),
                        );
                    };

                    queueMicrotask(trigger);

                    return {};
                },
            }),
        ];
    },
});
