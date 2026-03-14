import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode, ResolvedPos } from '@tiptap/pm/model';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorView } from '@tiptap/pm/view';

type BlockInfo = {
    pos: number;
    node: ProseMirrorNode;
};

function isBlockNode(node: ProseMirrorNode): boolean {
    return node.type.name === 'heading' || node.type.name === 'paragraph';
}

function getBlockInfoFromResolvedPos($pos: ResolvedPos): BlockInfo | null {
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const node = $pos.node(depth);
        if (!isBlockNode(node)) {
            continue;
        }

        return {
            pos: $pos.before(depth),
            node,
        };
    }

    return null;
}

function getBlockInfoFromCoords(
    view: EditorView,
    clientX: number,
    clientY: number,
): BlockInfo | null {
    const pointTarget = view.dom.ownerDocument.elementFromPoint(clientX, clientY);
    if (pointTarget instanceof HTMLElement) {
        const blockElement = pointTarget.closest('[data-block-tree-node]');
        if (blockElement instanceof HTMLElement && view.dom.contains(blockElement)) {
            const domPos = view.posAtDOM(blockElement, 0);
            const $domPos = view.state.doc.resolve(domPos);
            const domBlockInfo = getBlockInfoFromResolvedPos($domPos);
            if (domBlockInfo) {
                return domBlockInfo;
            }
        }
    }

    const coords = view.posAtCoords({
        left: clientX,
        top: clientY,
    });

    if (!coords || typeof coords.pos !== 'number') {
        return null;
    }

    const $pos = view.state.doc.resolve(coords.pos);

    return getBlockInfoFromResolvedPos($pos);
}

function clearDropIndicators(view: EditorView): void {
    const root = view.dom;
    root.querySelectorAll('.bt-block-drop-before, .bt-block-drop-after').forEach((node) => {
        node.classList.remove('bt-block-drop-before');
        node.classList.remove('bt-block-drop-after');
    });

    const document = view.dom.ownerDocument;
    const floatingIndicator = document.querySelector('[data-bt-block-drop-indicator="true"]');
    if (floatingIndicator instanceof HTMLElement) {
        floatingIndicator.remove();
    }
}

function applyDropIndicator(
    view: EditorView,
    blockPos: number,
    placeAfter: boolean,
): void {
    clearDropIndicators(view);
    const nodeDom = view.nodeDOM(blockPos);
    if (!(nodeDom instanceof HTMLElement)) {
        return;
    }

    nodeDom.classList.add(placeAfter ? 'bt-block-drop-after' : 'bt-block-drop-before');

    const rect = nodeDom.getBoundingClientRect();
    const lineY = placeAfter ? rect.bottom : rect.top;
    const lineHeight = 2;
    const left = Math.max(0, rect.left - 18);
    const width = rect.width + 24;

    const document = view.dom.ownerDocument;
    const floatingIndicator = document.createElement('div');
    floatingIndicator.setAttribute('data-bt-block-drop-indicator', 'true');
    floatingIndicator.style.position = 'fixed';
    floatingIndicator.style.left = `${left}px`;
    floatingIndicator.style.top = `${Math.round(lineY - lineHeight / 2)}px`;
    floatingIndicator.style.width = `${Math.max(24, Math.round(width))}px`;
    floatingIndicator.style.height = `${lineHeight}px`;
    floatingIndicator.style.borderRadius = '9999px';
    floatingIndicator.style.background = 'color-mix(in srgb, rgb(29 78 216) 58%, transparent)';
    floatingIndicator.style.boxShadow = '0 0 0 1px color-mix(in srgb, rgb(29 78 216) 18%, transparent)';
    floatingIndicator.style.pointerEvents = 'none';
    floatingIndicator.style.zIndex = '9999';

    document.body.appendChild(floatingIndicator);
}

function moveBlock(
    view: EditorView,
    sourcePos: number,
    targetPos: number,
    placeAfter: boolean,
): boolean {
    if (sourcePos === targetPos) {
        return false;
    }

    const sourceNode = view.state.doc.nodeAt(sourcePos);
    const targetNode = view.state.doc.nodeAt(targetPos);
    if (!sourceNode || !targetNode || !isBlockNode(sourceNode) || !isBlockNode(targetNode)) {
        return false;
    }

    let insertPos = placeAfter ? targetPos + targetNode.nodeSize : targetPos;

    if (
        (placeAfter && sourcePos === targetPos + targetNode.nodeSize) ||
        (!placeAfter && sourcePos + sourceNode.nodeSize === targetPos)
    ) {
        return false;
    }

    if (sourcePos < insertPos) {
        insertPos -= sourceNode.nodeSize;
    }

    let tr = view.state.tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
    tr = tr.insert(insertPos, sourceNode);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
    view.dispatch(tr.scrollIntoView());

    return true;
}

function createHandleDecoration(doc: ProseMirrorNode, pos: number): Decoration {
    return Decoration.widget(
        pos + 1,
        () => {
            const handle = document.createElement('button');
            const blockNode = doc.nodeAt(pos);
            const blockId =
                typeof blockNode?.attrs?.id === 'string' && blockNode.attrs.id.trim() !== ''
                    ? blockNode.attrs.id.trim()
                    : null;
            handle.type = 'button';
            handle.className = 'bt-block-handle';
            handle.contentEditable = 'false';
            handle.tabIndex = -1;
            handle.draggable = false;
            handle.setAttribute('aria-label', 'Move block');
            handle.setAttribute('title', 'Move block');
            handle.setAttribute('data-bt-block-handle', 'true');
            handle.setAttribute('data-block-pos', String(pos));
            if (blockId) {
                handle.setAttribute('data-block-id', blockId);
            }
            handle.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="bt-block-handle-icon" aria-hidden="true"><circle cx="9" cy="5" r="1"></circle><circle cx="9" cy="12" r="1"></circle><circle cx="9" cy="19" r="1"></circle><circle cx="15" cy="5" r="1"></circle><circle cx="15" cy="12" r="1"></circle><circle cx="15" cy="19" r="1"></circle></svg>';

            return handle;
        },
        { side: -1 },
    );
}

function buildHandleDecorations(doc: ProseMirrorNode): DecorationSet {
    const decorations: Decoration[] = [];

    doc.descendants((node, pos) => {
        if (!isBlockNode(node)) {
            return true;
        }

        decorations.push(createHandleDecoration(doc, pos));

        return true;
    });

    return DecorationSet.create(doc, decorations);
}

export const BlockDragHandleExtension = Extension.create({
    name: 'blockDragHandleExtension',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                state: {
                    init: (_, state) => buildHandleDecorations(state.doc),
                    apply: (tr, decorationSet) => {
                        if (!tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildHandleDecorations(tr.doc);
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

                            const handle = target.closest('[data-bt-block-handle="true"]');
                            if (!(handle instanceof HTMLElement)) {
                                return false;
                            }

                            const sourcePos = Number.parseInt(
                                handle.getAttribute('data-block-pos') ?? '',
                                10,
                            );
                            if (!Number.isFinite(sourcePos)) {
                                return false;
                            }

                            const sourceNode = view.state.doc.nodeAt(sourcePos);
                            if (!sourceNode || !isBlockNode(sourceNode)) {
                                return false;
                            }

                            event.preventDefault();
                            event.stopPropagation();

                            let moved = false;
                            let lastX = event.clientX;
                            let lastY = event.clientY;
                            let activeTargetPos: number | null = null;
                            let activePlaceAfter = false;

                            const onMouseMove = (moveEvent: MouseEvent) => {
                                lastX = moveEvent.clientX;
                                lastY = moveEvent.clientY;

                                if (
                                    !moved &&
                                    Math.hypot(
                                        moveEvent.clientX - event.clientX,
                                        moveEvent.clientY - event.clientY,
                                    ) >= 4
                                ) {
                                    moved = true;
                                }

                                if (!moved) {
                                    return;
                                }

                                const targetInfo = getBlockInfoFromCoords(
                                    view,
                                    moveEvent.clientX,
                                    moveEvent.clientY,
                                );
                                if (!targetInfo || targetInfo.pos === sourcePos) {
                                    clearDropIndicators(view);
                                    activeTargetPos = null;
                                    return;
                                }

                                const targetDom = view.nodeDOM(targetInfo.pos);
                                if (!(targetDom instanceof HTMLElement)) {
                                    clearDropIndicators(view);
                                    activeTargetPos = null;
                                    return;
                                }

                                const rect = targetDom.getBoundingClientRect();
                                const placeAfter = moveEvent.clientY >= rect.top + rect.height / 2;

                                activeTargetPos = targetInfo.pos;
                                activePlaceAfter = placeAfter;
                                applyDropIndicator(view, targetInfo.pos, placeAfter);
                            };

                            const onMouseUp = () => {
                                window.removeEventListener('mousemove', onMouseMove, true);
                                window.removeEventListener('mouseup', onMouseUp, true);

                                clearDropIndicators(view);

                                if (!moved || activeTargetPos === null) {
                                    return;
                                }

                                const targetInfo = getBlockInfoFromCoords(view, lastX, lastY);
                                const finalTargetPos = targetInfo?.pos ?? activeTargetPos;

                                moveBlock(view, sourcePos, finalTargetPos, activePlaceAfter);
                            };

                            window.addEventListener('mousemove', onMouseMove, true);
                            window.addEventListener('mouseup', onMouseUp, true);

                            return true;
                        },
                    },
                },
            }),
        ];
    },
});
