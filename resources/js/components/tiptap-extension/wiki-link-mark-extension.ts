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
                contenteditable: 'false',
                spellcheck: 'false',
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
        const workspaceSlugFromPathname = (pathname: string): string | null => {
            const match = pathname.match(/^\/w\/([^/]+)\//);
            if (!match) {
                return null;
            }

            const slug = decodeURIComponent(match[1] ?? '').trim();

            return slug !== '' ? slug : null;
        };

        const workspaceSlugFromHref = (href: string): string | null => {
            const match = href.match(/\/w\/([^/]+)\//);
            if (!match) {
                return null;
            }

            const slug = decodeURIComponent(match[1] ?? '').trim();

            return slug !== '' ? slug : null;
        };

        const workspaceSlugFromInertiaPage = (): string | null => {
            if (typeof document === 'undefined') {
                return null;
            }

            const appElement = document.getElementById('app');
            const payload = appElement?.getAttribute('data-page');
            if (!payload) {
                return null;
            }

            if (workspaceSlugFromInertiaPageCache.payload === payload) {
                return workspaceSlugFromInertiaPageCache.slug;
            }

            try {
                const page = JSON.parse(payload) as {
                    props?: {
                        currentWorkspace?: {
                            slug?: string | null;
                        } | null;
                    } | null;
                };
                const slug = page?.props?.currentWorkspace?.slug;
                const resolved = typeof slug === 'string' && slug.trim() !== '' ? slug.trim() : null;
                workspaceSlugFromInertiaPageCache = {
                    payload,
                    slug: resolved,
                };

                return resolved;
            } catch {
                workspaceSlugFromInertiaPageCache = {
                    payload,
                    slug: null,
                };

                return null;
            }
        };

        let workspaceSlugFromInertiaPageCache: {
            payload: string | null;
            slug: string | null;
        } = {
            payload: null,
            slug: null,
        };

        const activeWorkspaceSlug = (): string | null => {
            if (typeof window === 'undefined') {
                return null;
            }

            return workspaceSlugFromPathname(window.location.pathname) ?? workspaceSlugFromInertiaPage();
        };

        const syncCrossWorkspaceWikiLinkClasses = (root: ParentNode): void => {
            const activeSlug = activeWorkspaceSlug();
            if (!activeSlug) {
                return;
            }

            const links = root.querySelectorAll<HTMLElement>('[data-wikilink="true"]');
            links.forEach((link) => {
                const href = (link.getAttribute('data-href') ?? '').trim();
                const targetSlug = workspaceSlugFromHref(href);
                const isCrossWorkspace = targetSlug !== null && targetSlug !== activeSlug;

                link.classList.toggle('md-wikilink-cross-workspace', isCrossWorkspace);
                if (isCrossWorkspace) {
                    link.setAttribute('data-cross-workspace', 'true');
                } else {
                    link.removeAttribute('data-cross-workspace');
                }
            });
        };

        const findWikiLinkRange = (state: any, from: number) => {
            const markType = state.schema.marks.wikiLink;
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

            return {
                from: start,
                to: end,
            };
        };

        const isInsideWikiLink = (state: any): boolean => {
            return state.selection.$from
                .marks()
                .some((mark: any) => mark.type.name === 'wikiLink');
        };

        const isTextInputKey = (event: KeyboardEvent) => {
            if (event.metaKey || event.ctrlKey || event.altKey) {
                return false;
            }

            return event.key.length === 1;
        };

        return [
            new Plugin({
                view: (view) => {
                    syncCrossWorkspaceWikiLinkClasses(view.dom);

                    return {
                        update: (updatedView) => {
                            syncCrossWorkspaceWikiLinkClasses(updatedView.dom);
                        },
                    };
                },
                props: {
                    handleKeyDown: (view, event) => {
                        const { state } = view;
                        const markType = state.schema.marks.wikiLink;

                        if (!markType || !state.selection.empty) {
                            return false;
                        }

                        if (
                            event.key === 'Backspace' ||
                            event.key === 'Delete'
                        ) {
                            let range = null;
                            const cursor = state.selection.from;

                            if (isInsideWikiLink(state)) {
                                range = findWikiLinkRange(state, cursor);
                            } else {
                                const $cursor = state.doc.resolve(cursor);
                                if (event.key === 'Backspace') {
                                    const nodeBefore = $cursor.nodeBefore;
                                    if (
                                        nodeBefore &&
                                        nodeBefore.isText &&
                                        markType.isInSet(nodeBefore.marks)
                                    ) {
                                        range = findWikiLinkRange(
                                            state,
                                            Math.max(1, cursor - 1),
                                        );
                                    }
                                } else {
                                    const nodeAfter = $cursor.nodeAfter;
                                    if (
                                        nodeAfter &&
                                        nodeAfter.isText &&
                                        markType.isInSet(nodeAfter.marks)
                                    ) {
                                        range = findWikiLinkRange(
                                            state,
                                            cursor + 1,
                                        );
                                    }
                                }
                            }

                            if (!range) {
                                return false;
                            }

                            event.preventDefault();

                            const tr = state.tr.delete(range.from, range.to);
                            tr.setSelection(
                                TextSelection.create(tr.doc, range.from),
                            );
                            view.dispatch(tr);

                            return true;
                        }

                        if (
                            !isTextInputKey(event) ||
                            !isInsideWikiLink(state)
                        ) {
                            return false;
                        }

                        event.preventDefault();
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

                        const noteId = element.getAttribute('data-note-id');
                        const storedHref = element.getAttribute('data-href');

                        let href: string | null = storedHref;
                        if (noteId) {
                            const wsMatch = window.location.pathname.match(/^\/w\/([^/]+)\//);
                            const wsSlug = wsMatch ? decodeURIComponent(wsMatch[1] ?? '') : null;
                            href = wsSlug ? `/w/${wsSlug}/notes/${noteId}` : `/notes/${noteId}`;
                        }

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
