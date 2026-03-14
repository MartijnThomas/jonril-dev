import { Extension } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';

function findLinkRange(state: any, from: number) {
    const markType = state.schema.marks.link;
    if (!markType) {
        return null;
    }

    let start = from;
    let end = from;

    while (start > 0) {
        const $pos = state.doc.resolve(start);
        const nodeBefore = $pos.nodeBefore;
        if (
            !nodeBefore ||
            !nodeBefore.isText ||
            !markType.isInSet(nodeBefore.marks)
        ) {
            break;
        }
        start -= nodeBefore.nodeSize;
    }

    while (end < state.doc.content.size) {
        const $pos = state.doc.resolve(end);
        const nodeAfter = $pos.nodeAfter;
        if (
            !nodeAfter ||
            !nodeAfter.isText ||
            !markType.isInSet(nodeAfter.marks)
        ) {
            break;
        }
        end += nodeAfter.nodeSize;
    }

    if (start === end) {
        return null;
    }

    return { from: start, to: end, markType };
}

export const BlockLinkBehaviorExtension = Extension.create({
    name: 'blockLinkBehavior',

    addProseMirrorPlugins() {
        return [
            new Plugin({
                props: {
                    handleKeyDown: (view, event) => {
                        const { state } = view;
                        if (!state.selection.empty) {
                            return false;
                        }

                        const cursor = state.selection.from;
                        const linkRange = findLinkRange(state, cursor);
                        if (!linkRange) {
                            return false;
                        }

                        if (event.key === 'Escape') {
                            event.preventDefault();
                            const tr = state.tr.setSelection(
                                TextSelection.create(state.doc, linkRange.to),
                            );
                            tr.removeStoredMark(linkRange.markType);
                            view.dispatch(tr);
                            return true;
                        }

                        const shouldBreakOut =
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.altKey &&
                            [' ', '.', ',', ';', ':', '!', '?', ')', ']', '}'].includes(
                                event.key,
                            ) &&
                            cursor === linkRange.to;

                        if (!shouldBreakOut) {
                            return false;
                        }

                        event.preventDefault();
                        const tr = state.tr;
                        tr.removeStoredMark(linkRange.markType);
                        tr.insertText(event.key, cursor, cursor);
                        tr.removeMark(cursor, cursor + event.key.length, linkRange.markType);
                        tr.setSelection(
                            TextSelection.create(tr.doc, cursor + event.key.length),
                        );
                        view.dispatch(tr);
                        return true;
                    },
                },
            }),
        ];
    },
});

