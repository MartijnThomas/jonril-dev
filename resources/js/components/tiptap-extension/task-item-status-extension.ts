import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type TaskStatus =
    | 'canceled'
    | 'assigned'
    | 'in_progress'
    | 'migrated'
    | 'starred'
    | 'backlog'
    | null;

const TASK_STATUS_TOKEN_REGEX = /^(\s*)(—|<|\*|\?|\/)(?=\s|$)/u;

function statusFromToken(token: string): TaskStatus {
    if (token === '—') {
        return 'canceled';
    }

    if (token === '<') {
        return 'assigned';
    }

    if (token === '*') {
        return 'starred';
    }

    if (token === '?') {
        return 'backlog';
    }

    if (token === '/') {
        return 'in_progress';
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

function findFirstStatusTokenRange(
    node: any,
    pos: number,
): {
    status: Exclude<TaskStatus, null>;
    from: number;
    to: number;
} | null {
    let result: {
        status: Exclude<TaskStatus, null>;
        from: number;
        to: number;
    } | null = null;

    node.descendants((child: any, childPos: number) => {
        if (result) {
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

        result = {
            status: match.status,
            from: absoluteStart,
            to: absoluteEnd,
        };

        return false;
    });

    return result;
}

function hasMeaningfulTaskText(node: any): boolean {
    let hasText = false;

    node.descendants((child: any) => {
        if (hasText) {
            return false;
        }

        if (
            child.type?.name === 'taskList' ||
            child.type?.name === 'bulletList' ||
            child.type?.name === 'orderedList'
        ) {
            return false;
        }

        if (!child.isText || typeof child.text !== 'string') {
            return;
        }

        if (child.text.trim() !== '') {
            hasText = true;
            return false;
        }
    });

    return hasText;
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
                        const isTaskNode = node.type.name === 'taskItem';
                        const migratedToNoteId = isTaskNode
                            ? (typeof node.attrs.migratedToNoteId === 'string'
                                  ? node.attrs.migratedToNoteId.trim()
                                  : '')
                            : '';
                        const migratedFromNoteId = isTaskNode
                            ? (typeof node.attrs.migratedFromNoteId === 'string'
                                  ? node.attrs.migratedFromNoteId.trim()
                                  : '')
                            : '';
                        const migratedFromBlockId = isTaskNode
                            ? (typeof node.attrs.migratedFromBlockId === 'string'
                                  ? node.attrs.migratedFromBlockId.trim()
                                  : '')
                            : '';
                        const backlogPromotedAt = isTaskNode
                            ? (typeof node.attrs.backlogPromotedAt === 'string'
                                  ? node.attrs.backlogPromotedAt.trim()
                                  : '')
                            : '';
                        const completedAt = isTaskNode
                            ? (typeof node.attrs.completedAt === 'string'
                                  ? node.attrs.completedAt.trim()
                                  : '')
                            : '';
                        const canceledAt = isTaskNode
                            ? (typeof node.attrs.canceledAt === 'string'
                                  ? node.attrs.canceledAt.trim()
                                  : '')
                            : '';
                        const startedAt = isTaskNode
                            ? (typeof node.attrs.startedAt === 'string'
                                  ? node.attrs.startedAt.trim()
                                  : '')
                            : '';
                        let resolvedStatus = nextStatus;
                        let resolvedChecked = Boolean(node.attrs.checked);
                        let resolvedMigratedToNoteId = migratedToNoteId;
                        let resolvedMigratedFromNoteId = migratedFromNoteId;
                        let resolvedMigratedFromBlockId = migratedFromBlockId;
                        let resolvedBacklogPromotedAt = backlogPromotedAt;
                        let resolvedCompletedAt = completedAt;
                        let resolvedCanceledAt = canceledAt;
                        let resolvedStartedAt = startedAt;

                        if (
                            isTaskNode &&
                            currentStatus === 'migrated' &&
                            nextStatus === null
                        ) {
                            if (migratedToNoteId !== '') {
                                resolvedStatus = 'migrated';
                                resolvedChecked = false;
                            } else {
                                resolvedStatus = null;
                                resolvedChecked = false;
                            }
                        }

                        // Clicking the checkbox on a canceled task should reopen it.
                        // We treat checked=true as explicit reopen intent and remove
                        // the leading canceled token (— + separator spaces).
                        if (
                            isTaskNode &&
                            resolvedStatus === 'canceled' &&
                            resolvedChecked
                        ) {
                            const tokenRange = findFirstStatusTokenRange(node, pos);
                            if (tokenRange?.status === 'canceled') {
                                tr.insertText('', tokenRange.from, tokenRange.to);
                                resolvedStatus = null;
                                resolvedChecked = false;
                            }
                        }

                        // Clicking an open backlog task should promote it to a
                        // regular open task instead of completing it.
                        if (
                            isTaskNode &&
                            resolvedStatus === 'backlog' &&
                            resolvedChecked
                        ) {
                            const tokenRange = findFirstStatusTokenRange(node, pos);
                            if (tokenRange?.status === 'backlog') {
                                tr.insertText('', tokenRange.from, tokenRange.to);
                            }

                            resolvedStatus = null;
                            resolvedChecked = false;
                            resolvedBacklogPromotedAt =
                                resolvedBacklogPromotedAt !== ''
                                    ? resolvedBacklogPromotedAt
                                    : new Date().toISOString();
                        }

                        if (
                            isTaskNode &&
                            (migratedToNoteId !== '' ||
                                migratedFromNoteId !== '' ||
                                migratedFromBlockId !== '') &&
                            !hasMeaningfulTaskText(node)
                        ) {
                            resolvedStatus = null;
                            resolvedChecked = false;
                            resolvedMigratedToNoteId = '';
                            resolvedMigratedFromNoteId = '';
                            resolvedMigratedFromBlockId = '';
                        }

                        if (isTaskNode) {
                            if (resolvedChecked) {
                                resolvedCompletedAt =
                                    resolvedCompletedAt !== ''
                                        ? resolvedCompletedAt
                                        : new Date().toISOString();
                            } else {
                                resolvedCompletedAt = '';
                            }

                            if (resolvedStatus === 'canceled') {
                                resolvedCanceledAt =
                                    resolvedCanceledAt !== ''
                                        ? resolvedCanceledAt
                                        : new Date().toISOString();
                            } else {
                                resolvedCanceledAt = '';
                            }

                            if (resolvedStatus === 'in_progress') {
                                resolvedStartedAt =
                                    resolvedStartedAt !== ''
                                        ? resolvedStartedAt
                                        : new Date().toISOString();
                            } else {
                                resolvedStartedAt = '';
                            }
                        }

                        if (
                            currentStatus === resolvedStatus &&
                            (!isTaskNode ||
                                (Boolean(node.attrs.checked) === resolvedChecked &&
                                    migratedToNoteId === resolvedMigratedToNoteId &&
                                    migratedFromNoteId === resolvedMigratedFromNoteId &&
                                    migratedFromBlockId === resolvedMigratedFromBlockId &&
                                    backlogPromotedAt === resolvedBacklogPromotedAt &&
                                    completedAt === resolvedCompletedAt &&
                                    canceledAt === resolvedCanceledAt &&
                                    startedAt === resolvedStartedAt))
                        ) {
                            return;
                        }

                        tr.setNodeMarkup(pos, undefined, {
                            ...node.attrs,
                            checked: resolvedChecked,
                            taskStatus: resolvedStatus,
                            migratedToNoteId:
                                resolvedMigratedToNoteId !== ''
                                    ? resolvedMigratedToNoteId
                                    : null,
                            migratedFromNoteId:
                                resolvedMigratedFromNoteId !== ''
                                    ? resolvedMigratedFromNoteId
                                    : null,
                            migratedFromBlockId:
                                resolvedMigratedFromBlockId !== ''
                                    ? resolvedMigratedFromBlockId
                                    : null,
                            backlogPromotedAt:
                                resolvedBacklogPromotedAt !== ''
                                    ? resolvedBacklogPromotedAt
                                    : null,
                            completedAt:
                                resolvedCompletedAt !== ''
                                    ? resolvedCompletedAt
                                    : null,
                            canceledAt:
                                resolvedCanceledAt !== ''
                                    ? resolvedCanceledAt
                                    : null,
                            startedAt:
                                resolvedStartedAt !== ''
                                    ? resolvedStartedAt
                                    : null,
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
