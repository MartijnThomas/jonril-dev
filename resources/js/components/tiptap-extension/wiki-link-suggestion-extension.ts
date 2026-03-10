import { computePosition, flip, shift } from '@floating-ui/dom';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import Suggestion, { exitSuggestion } from '@tiptap/suggestion';
import { WikiLinkList } from '@/components/tiptap-wikilink/wiki-link-list';

type WikiLinkNote = {
    id: string;
    title: string;
    path?: string;
    href?: string;
};

const wikiLinkPluginKey = new PluginKey('wikiLinkSuggestion');

function workspaceSlugFromPathname(pathname: string): string | null {
    const match = pathname.match(/^\/w\/([^/]+)\//);
    if (!match) {
        return null;
    }

    return decodeURIComponent(match[1] ?? '').trim() || null;
}

function fallbackWikiHref(noteId: string): string {
    if (typeof window !== 'undefined') {
        const slug = workspaceSlugFromPathname(window.location.pathname);
        if (slug) {
            return `/w/${slug}/notes/${noteId}`;
        }
    }

    return `/notes/${noteId}`;
}

const updatePosition = (editor: any, element: HTMLElement) => {
    const virtualElement = {
        getBoundingClientRect: () =>
            posToDOMRect(
                editor.view,
                editor.state.selection.from,
                editor.state.selection.to,
            ),
    };

    computePosition(virtualElement, element, {
        placement: 'bottom-start',
        strategy: 'absolute',
        middleware: [shift(), flip()],
    }).then(({ x, y, strategy }) => {
        element.style.width = 'max-content';
        element.style.position = strategy;
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
    });
};

const normalizeQuery = (value: string) => value.trim().toLowerCase();

export const WikiLinkSuggestion = Extension.create<{
    notes: WikiLinkNote[];
}>({
    name: 'wikiLinkSuggestion',

    addOptions() {
        return {
            notes: [],
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion<WikiLinkNote>({
                pluginKey: wikiLinkPluginKey,
                editor: this.editor,
                char: '[[',
                allowSpaces: true,
                startOfLine: false,
                items: ({ query }) => {
                    const normalized = normalizeQuery(query);

                    return this.options.notes
                        .filter((note) =>
                            note.title
                                .toLowerCase()
                                .includes(normalized),
                        )
                        .slice(0, 8);
                },
                command: ({ editor, range, props }) => {
                    editor
                        .chain()
                        .focus()
                        .insertContentAt(
                            range,
                            [
                                {
                                    type: 'text',
                                    text: props.title,
                                    marks: [
                                        {
                                            type: 'wikiLink',
                                            attrs: {
                                                noteId: props.id,
                                                href:
                                                    props.href ??
                                                    fallbackWikiHref(
                                                        props.id,
                                                    ),
                                            },
                                        },
                                    ],
                                },
                                {
                                    type: 'text',
                                    text: ' ',
                                },
                            ],
                        )
                        .run();

                    exitSuggestion(editor.view, wikiLinkPluginKey);
                },
                render: () => {
                    let component: ReactRenderer<any, any>;

                    return {
                        onStart: (props) => {
                            component = new ReactRenderer(WikiLinkList, {
                                props,
                                editor: props.editor,
                            });

                            if (!props.clientRect) {
                                return;
                            }

                            component.element.style.position = 'absolute';
                            document.body.appendChild(component.element);
                            updatePosition(props.editor, component.element);
                        },

                        onUpdate(props) {
                            component.updateProps(props);

                            if (!props.clientRect) {
                                return;
                            }

                            updatePosition(props.editor, component.element);
                        },

                        onKeyDown(props) {
                            if (props.event.key === 'Escape') {
                                component.destroy();
                                return true;
                            }

                            return component.ref?.onKeyDown(props) ?? false;
                        },

                        onExit() {
                            component.element.remove();
                            component.destroy();
                        },
                    };
                },
            }),
        ];
    },
});
