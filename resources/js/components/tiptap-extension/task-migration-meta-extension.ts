import { router } from '@inertiajs/react';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

type LinkableNote = {
    id: string;
    title: string;
    href?: string;
};

function workspaceSlugFromPathname(pathname: string): string | null {
    const match = pathname.match(/^\/w\/([^/]+)\//);
    if (!match) {
        return null;
    }

    return decodeURIComponent(match[1] ?? '').trim() || null;
}

function fallbackNoteHref(noteId: string): string {
    if (typeof window !== 'undefined') {
        const slug = workspaceSlugFromPathname(window.location.pathname);
        if (slug) {
            return `/w/${slug}/notes/${noteId}`;
        }
    }

    return `/notes/${noteId}`;
}

function buildMigrationMetaDecorations(doc: any, notes: LinkableNote[]): DecorationSet {
    const decorations: Decoration[] = [];
    const noteById = new Map<string, LinkableNote>();

    notes.forEach((note) => {
        if (typeof note.id === 'string' && note.id !== '') {
            noteById.set(note.id, note);
        }
    });

    doc.descendants((node: any, pos: number) => {
        if (node.type?.name !== 'taskItem') {
            return;
        }

        const attrs = (node.attrs ?? {}) as {
            taskStatus?: string | null;
            migratedToNoteId?: string | null;
            migratedFromNoteId?: string | null;
        };

        const migratedToId =
            typeof attrs.migratedToNoteId === 'string' && attrs.migratedToNoteId.trim() !== ''
                ? attrs.migratedToNoteId.trim()
                : null;
        const migratedFromId =
            typeof attrs.migratedFromNoteId === 'string' && attrs.migratedFromNoteId.trim() !== ''
                ? attrs.migratedFromNoteId.trim()
                : null;

        let label: string | null = null;
        let noteId: string | null = null;

        if (attrs.taskStatus === 'migrated' && migratedToId) {
            label = 'migrated to:';
            noteId = migratedToId;
        } else if (migratedFromId) {
            label = 'migrated from:';
            noteId = migratedFromId;
        }

        if (!label || !noteId) {
            return;
        }

        const linkedNote = noteById.get(noteId);
        const noteTitle = linkedNote?.title?.trim() || 'Untitled';
        const href = linkedNote?.href?.trim() || fallbackNoteHref(noteId);

        const contentEnd = pos + node.nodeSize - 1;

        decorations.push(
            Decoration.widget(
                contentEnd,
                () => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'md-task-migration-meta';
                    wrapper.contentEditable = 'false';

                    const labelNode = document.createElement('span');
                    labelNode.className = 'md-task-migration-meta-label';
                    labelNode.textContent = `${label} `;
                    wrapper.appendChild(labelNode);

                    const linkNode = document.createElement('a');
                    linkNode.className = 'md-task-migration-link';
                    linkNode.href = href;
                    linkNode.textContent = noteTitle;
                    linkNode.setAttribute('data-note-id', noteId);
                    linkNode.setAttribute('data-href', href);
                    linkNode.addEventListener('click', (event) => {
                        const mouseEvent = event as MouseEvent;
                        const isModifiedClick =
                            mouseEvent.button !== 0 ||
                            mouseEvent.metaKey ||
                            mouseEvent.ctrlKey ||
                            mouseEvent.shiftKey ||
                            mouseEvent.altKey;

                        if (isModifiedClick) {
                            return;
                        }

                        event.preventDefault();
                        router.visit(href, {
                            preserveScroll: false,
                            preserveState: false,
                        });
                    });
                    wrapper.appendChild(linkNode);

                    return wrapper;
                },
                { side: 1 },
            ),
        );
    });

    return DecorationSet.create(doc, decorations);
}

export const TaskMigrationMetaExtension = Extension.create<{
    notes: LinkableNote[];
}>({
    name: 'taskMigrationMetaExtension',

    addOptions() {
        return {
            notes: [],
        };
    },

    addProseMirrorPlugins() {
        return [
            new Plugin({
                state: {
                    init: (_, state) =>
                        buildMigrationMetaDecorations(state.doc, this.options.notes),
                    apply: (tr, decorationSet) => {
                        if (!tr.docChanged) {
                            return decorationSet.map(tr.mapping, tr.doc);
                        }

                        return buildMigrationMetaDecorations(tr.doc, this.options.notes);
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
