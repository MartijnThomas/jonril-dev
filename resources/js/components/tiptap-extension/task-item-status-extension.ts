import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type TaskStatus =
    | 'canceled'
    | 'deferred'
    | 'starred'
    | 'question'
    | null;

const TASK_STATUS_TOKEN_REGEX = /^(\s*)(—|>|\*|\?)(?=\s|$)/u;

function statusFromToken(token: string): TaskStatus {
    if (token === '—') {
        return 'canceled';
    }

    if (token === '>') {
        return 'deferred';
    }

    if (token === '*') {
        return 'starred';
    }

    if (token === '?') {
        return 'question';
    }

    return null;
}

function tokenMatchForText(text: string): {
    status: Exclude<TaskStatus, null>;
    tokenStart: number;
    tokenEnd: number;
} | null {
    const match = TASK_STATUS_TOKEN_REGEX.exec(text);
    if (!match) {
        return null;
    }

    const leading = match[1] ?? '';
    const token = match[2] ?? '';
    const status = statusFromToken(token);
    if (!status) {
        return null;
    }

    const tokenStart = leading.length;
    const tokenEnd = tokenStart + token.length;

    return { status, tokenStart, tokenEnd };
}

function extractStatusFromTaskItem(node: any): TaskStatus {
    let result: TaskStatus = null;
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
        result = match?.status ?? null;
        done = true;

        return false;
    });

    return result;
}

function buildStatusDecorations(doc: any): DecorationSet {
    const decorations: Decoration[] = [];

    doc.descendants((node: any, pos: number) => {
        if (node.type.name !== 'taskItem' && node.type.name !== 'listItem') {
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
            const text = child.text as string;
            let separatorOffset = match.tokenEnd;
            while (text.charAt(separatorOffset) === ' ') {
                absoluteEnd += 1;
                separatorOffset += 1;
            }

            const statusClass = `md-task-status-token md-task-status-token--${match.status}`;

            decorations.push(
                Decoration.inline(absoluteStart, absoluteEnd, {
                    class: statusClass,
                }),
            );

            applied = true;
            return false;
        });
    });

    return DecorationSet.create(doc, decorations);
}

export const TaskItemStatusExtension = Extension.create({
    name: 'taskItemStatusExtension',

    addProseMirrorPlugins() {
        return [
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
                            node.type.name !== 'taskItem' &&
                            node.type.name !== 'listItem'
                        ) {
                            return;
                        }

                        const nextStatus = extractStatusFromTaskItem(node);
                        const currentStatus = (node.attrs.taskStatus ?? null) as TaskStatus;

                        if (currentStatus === nextStatus) {
                            return;
                        }

                        tr.setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            taskStatus: nextStatus,
                        });
                        changed = true;
                    });

                    return changed ? tr : null;
                },
            }),
            new Plugin({
                state: {
                    init: (_, state) => buildStatusDecorations(state.doc),
                    apply: (tr, decorationSet) => {
                        if (!tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildStatusDecorations(tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                },
            }),
        ];
    },
});
