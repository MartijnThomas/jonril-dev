import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import type { TaskPriority } from '@/components/tiptap-extension/list-item-with-priority-extension';

type PriorityTokenMatch = {
    priority: Exclude<TaskPriority, null>;
    tokenStart: number;
    tokenEnd: number;
};

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

function priorityRangeClass(priority: Exclude<TaskPriority, null>): string {
    if (priority === 'high') {
        return 'md-priority-range md-priority-range--high';
    }

    if (priority === 'medium') {
        return 'md-priority-range md-priority-range--medium';
    }

    return 'md-priority-range md-priority-range--normal';
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

function buildPriorityDecorations(doc: any): DecorationSet {
    const decorations: Decoration[] = [];

    doc.descendants((node: any, pos: number) => {
        if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') {
            return;
        }

        const nodePriority = (node.attrs.priority ?? null) as TaskPriority;
        if (!nodePriority) {
            return;
        }

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
            return;
        }

        let tokenStartAbsolute = -1;

        paragraphNode.descendants((child: any, childPos: number) => {
            if (tokenStartAbsolute >= 0 || !child.isText || !child.text) {
                return;
            }

            const match = tokenMatchForText(child.text as string);
            if (!match) {
                return false;
            }

            tokenStartAbsolute =
                pos + 1 + paragraphPos + 1 + childPos + match.tokenStart;

            return false;
        });

        if (tokenStartAbsolute < 0) {
            return;
        }

        const paragraphContentEnd = pos + 1 + paragraphPos + paragraphNode.nodeSize - 1;
        if (paragraphContentEnd <= tokenStartAbsolute) {
            return;
        }

        decorations.push(
            Decoration.inline(tokenStartAbsolute, paragraphContentEnd, {
                class: priorityRangeClass(nodePriority),
            }),
        );
    });

    return DecorationSet.create(doc, decorations);
}

export const ListItemPriorityExtension = Extension.create({
    name: 'listItemPriorityExtension',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                state: {
                    init: (_, state) => buildPriorityDecorations(state.doc),
                    apply: (tr, decorationSet) => {
                        if (!tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildPriorityDecorations(tr.doc);
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
                    if (!transactions.some((transaction) => transaction.docChanged)) {
                        return null;
                    }

                    if (oldState.doc.eq(newState.doc)) {
                        return null;
                    }

                    const { tr } = newState;
                    let changed = false;

                    newState.doc.descendants((node, pos) => {
                        if (
                            node.type.name !== 'listItem' &&
                            node.type.name !== 'taskItem'
                        ) {
                            return;
                        }

                        const nextPriority = extractPriorityFromListItem(node);
                        const currentPriority = (node.attrs.priority ?? null) as TaskPriority;

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
            }),
        ];
    },
});
