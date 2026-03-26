import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

function isBlockNode(node: ProseMirrorNode): boolean {
    return node.type.name === 'heading' || node.type.name === 'paragraph';
}

function buildLineActionDecorations(doc: ProseMirrorNode): DecorationSet {
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (!isBlockNode(node)) {
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
                    button.className = 'bt-block-add-trigger';
                    button.contentEditable = 'false';
                    button.tabIndex = -1;
                    button.draggable = false;
                    button.setAttribute('aria-label', 'Add block action');
                    button.setAttribute('title', 'Add block action');
                    button.setAttribute('data-bt-block-add-trigger', 'true');
                    button.setAttribute('data-block-pos', String(pos));
                    if (blockId) {
                        button.setAttribute('data-block-id', blockId);
                    }
                    button.innerHTML =
                        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="bt-block-add-icon" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>';

                    return button;
                },
                { side: -2 },
            ),
        );

        return true;
    });

    return DecorationSet.create(doc, decorations);
}

export const BlockLineActionsExtension = Extension.create({
    name: 'blockLineActionsExtension',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                state: {
                    init: (_, state) => buildLineActionDecorations(state.doc),
                    apply: (tr, decorationSet) => {
                        if (!tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildLineActionDecorations(tr.doc);
                    },
                },
                props: {
                    decorations(state) {
                        return this.getState(state);
                    },
                    handleDOMEvents: {
                        mousedown: (_, event) => {
                            const target = event.target;
                            if (!(target instanceof Element)) {
                                return false;
                            }

                            const trigger = target.closest('[data-bt-block-add-trigger="true"]');
                            if (!(trigger instanceof HTMLElement)) {
                                return false;
                            }

                            const pos = Number.parseInt(trigger.getAttribute('data-block-pos') ?? '', 10);
                            if (!Number.isFinite(pos)) {
                                return false;
                            }

                            const rect = trigger.getBoundingClientRect();
                            event.preventDefault();
                            event.stopPropagation();

                            window.dispatchEvent(
                                new CustomEvent('block-line-actions:open', {
                                    detail: {
                                        x: Math.round(rect.right + 8),
                                        y: Math.round(rect.bottom + 2),
                                        pos,
                                    },
                                }),
                            );

                            return true;
                        },
                        touchend: (_, event) => {
                            const target = event.target;
                            if (!(target instanceof Element)) {
                                return false;
                            }

                            const trigger = target.closest('[data-bt-block-add-trigger="true"]');
                            if (!(trigger instanceof HTMLElement)) {
                                return false;
                            }

                            const pos = Number.parseInt(trigger.getAttribute('data-block-pos') ?? '', 10);
                            if (!Number.isFinite(pos)) {
                                return false;
                            }

                            const rect = trigger.getBoundingClientRect();
                            event.preventDefault();
                            event.stopPropagation();

                            window.dispatchEvent(
                                new CustomEvent('block-line-actions:open', {
                                    detail: {
                                        x: Math.round(rect.right + 8),
                                        y: Math.round(rect.bottom + 2),
                                        pos,
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

