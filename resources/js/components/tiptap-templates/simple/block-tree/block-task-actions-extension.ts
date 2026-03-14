import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

type TaskStatus = 'backlog' | 'in_progress' | 'canceled' | null;

function isTaskParagraph(node: ProseMirrorNode): boolean {
    return node.type.name === 'paragraph' && node.attrs.blockStyle === 'task';
}

function buildTaskActionDecorations(doc: ProseMirrorNode): DecorationSet {
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (!isTaskParagraph(node)) {
            return true;
        }

        decorations.push(
            Decoration.widget(
                pos + 1,
                () => {
                    const button = document.createElement('button');
                    const blockId =
                        typeof node.attrs.id === 'string' && node.attrs.id.trim() !== ''
                            ? node.attrs.id.trim()
                            : null;
                    button.type = 'button';
                    button.className = 'bt-task-actions-trigger';
                    button.contentEditable = 'false';
                    button.tabIndex = -1;
                    button.draggable = false;
                    button.setAttribute('aria-label', 'Task actions');
                    button.setAttribute('title', 'Task actions');
                    button.setAttribute('data-bt-task-actions-trigger', 'true');
                    button.setAttribute('data-block-pos', String(pos));
                    if (blockId) {
                        button.setAttribute('data-block-id', blockId);
                    }
                    button.innerHTML =
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="bt-task-actions-icon" aria-hidden="true"><path d="M2 12h20"></path><path d="m18 8 4 4-4 4"></path></svg>';

                    return button;
                },
                { side: -3 },
            ),
        );

        return true;
    });

    return DecorationSet.create(doc, decorations);
}

export const BlockTaskActionsExtension = Extension.create({
    name: 'blockTaskActionsExtension',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                state: {
                    init: (_, state) => buildTaskActionDecorations(state.doc),
                    apply: (tr, decorationSet) => {
                        if (!tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildTaskActionDecorations(tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                    handleDOMEvents: {
                        mousedown: (view, event) => {
                            const target = event.target;
                            if (!(target instanceof Element)) {
                                return false;
                            }

                            const trigger = target.closest('[data-bt-task-actions-trigger="true"]');
                            if (!(trigger instanceof HTMLElement)) {
                                return false;
                            }

                            const pos = Number.parseInt(trigger.getAttribute('data-block-pos') ?? '', 10);
                            if (!Number.isFinite(pos)) {
                                return false;
                            }

                            const taskNode = view.state.doc.nodeAt(pos);
                            if (!taskNode || !isTaskParagraph(taskNode)) {
                                return false;
                            }

                            const statusValue = taskNode.attrs.taskStatus;
                            const status: TaskStatus =
                                statusValue === 'backlog' ||
                                statusValue === 'in_progress' ||
                                statusValue === 'canceled'
                                    ? statusValue
                                    : null;

                            const blockId =
                                typeof taskNode.attrs.id === 'string' && taskNode.attrs.id.trim() !== ''
                                    ? taskNode.attrs.id.trim()
                                    : null;

                            const rect = trigger.getBoundingClientRect();
                            event.preventDefault();
                            event.stopPropagation();

                            window.dispatchEvent(
                                new CustomEvent('block-task-actions:open', {
                                    detail: {
                                        x: Math.round(rect.right + 8),
                                        y: Math.round(rect.bottom + 2),
                                        pos,
                                        status,
                                        blockId,
                                    },
                                }),
                            );

                            return true;
                        },
                    },
                },
            }),
        ];
    },
});
