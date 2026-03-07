import { router } from '@inertiajs/react';
import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';

export type WikiLinkAttributes = {
    noteId: string;
    href: string;
};

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        wikiLink: {
            setWikiLink: (attributes: WikiLinkAttributes) => ReturnType;
            unsetWikiLink: () => ReturnType;
        };
    }
}

export const WikiLinkMark = Mark.create({
    name: 'wikiLink',

    inclusive: false,

    addAttributes() {
        return {
            noteId: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-note-id'),
                renderHTML: (attributes: WikiLinkAttributes) => ({
                    'data-note-id': attributes.noteId,
                }),
            },
            href: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-href'),
                renderHTML: (attributes: WikiLinkAttributes) => ({
                    'data-href': attributes.href,
                }),
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-wikilink="true"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                'data-wikilink': 'true',
                class: 'md-wikilink',
            }),
            0,
        ];
    },

    addCommands() {
        return {
            setWikiLink:
                (attributes) =>
                ({ commands }) =>
                    commands.setMark(this.name, attributes),
            unsetWikiLink:
                () =>
                ({ commands }) =>
                    commands.unsetMark(this.name),
        };
    },

    addProseMirrorPlugins() {
        const findWikiLinkRange = (state: any) => {
            const markType = state.schema.marks.wikiLink;
            if (!markType) {
                return null;
            }

            const { from } = state.selection;
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

            return {
                from: start,
                to: end,
                text: state.doc.textBetween(start, end, '', ''),
            };
        };

        const isEditKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return false;
            }

            if (event.key.length === 1) {
                return true;
            }

            return event.key === 'Backspace' || event.key === 'Delete';
        };

        return [
            new Plugin({
                props: {
                    handleKeyDown: (view, event) => {
                        const { state } = view;

                        if (!state.selection.empty || !isEditKey(event)) {
                            return false;
                        }

                        const isInsideWikiLink = state.selection.$from
                            .marks()
                            .some((mark: any) => mark.type.name === 'wikiLink');

                        if (!isInsideWikiLink) {
                            return false;
                        }

                        const range = findWikiLinkRange(state);
                        if (!range) {
                            return false;
                        }

                        event.preventDefault();

                        let nextQuery = range.text;
                        if (event.key === 'Backspace') {
                            nextQuery = nextQuery.slice(0, -1);
                        } else if (event.key.length === 1) {
                            nextQuery = `${nextQuery}${event.key}`;
                        }

                        const replacement = `[[${nextQuery}`;
                        const tr = state.tr.insertText(
                            replacement,
                            range.from,
                            range.to,
                        );

                        const cursorPos = range.from + replacement.length;
                        tr.setSelection(TextSelection.create(tr.doc, cursorPos));
                        view.dispatch(tr);

                        return true;
                    },
                    handleClick: (view, _pos, event) => {
                        const mouseEvent = event as MouseEvent;
                        const target = mouseEvent.target as HTMLElement | null;
                        const element = target?.closest<HTMLElement>(
                            '[data-wikilink="true"]',
                        );

                        if (!element) {
                            return false;
                        }

                        if (!(mouseEvent.metaKey || mouseEvent.ctrlKey)) {
                            return false;
                        }

                        const href = element.getAttribute('data-href');
                        if (!href) {
                            return false;
                        }

                        mouseEvent.preventDefault();
                        router.visit(href, {
                            preserveScroll: true,
                            preserveState: false,
                        });

                        return true;
                    },
                },
            }),
        ];
    },
});
