import { computePosition, flip, shift } from '@floating-ui/dom';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { posToDOMRect, ReactRenderer } from '@tiptap/react';
import Suggestion, { exitSuggestion } from '@tiptap/suggestion';
import { BlockWikiLinkList } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-list';
import type {
    BlockWikiLinkNote,
    BlockWikiLinkSuggestionItem,
} from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';
import {
    buildProgressiveJournalSuggestions,
    displayTitleFromTargetPath,
    deriveTargetPathFromNote,
    editableJournalPathFromTargetPath,
    fallbackBlockWikiHrefFromTargetPath,
    findCompleteRawWikiLinks,
    normalizeHeadingText,
    normalizeJournalTargetPath,
    normalizeNoteTargetPath,
    parseWikiLinkQuery,
} from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';

export const blockWikiLinkSuggestionPluginKey = new PluginKey(
    'blockWikiLinkSuggestion',
);

const updatePosition = (editor: any, element: HTMLElement, anchorFrom: number) => {
    const safeFrom = Math.max(1, Math.min(anchorFrom, editor.state.doc.content.size));
    const safeTo = Math.min(safeFrom + 1, editor.state.doc.content.size);
    const virtualElement = {
        getBoundingClientRect: () =>
            posToDOMRect(
                editor.view,
                safeFrom,
                Math.max(safeFrom, safeTo),
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

export const BlockWikiLinkSuggestion = Extension.create<{
    notes: BlockWikiLinkNote[];
    language: string;
}>({
    name: 'blockWikiLinkSuggestion',

    addOptions() {
        return {
            notes: [],
            language: 'nl',
        };
    },

    addProseMirrorPlugins() {
        return [
            Suggestion<BlockWikiLinkSuggestionItem>({
                pluginKey: blockWikiLinkSuggestionPluginKey,
                editor: this.editor,
                char: '[[',
                allowSpaces: true,
                startOfLine: false,
                items: ({ query }) => {
                    let effectiveQuery = query;
                    const { state } = this.editor;
                    const parent = state.selection.$from.parent;
                    const parentStart = state.selection.$from.start();
                    const localCursor = Math.max(
                        0,
                        state.selection.from - parentStart,
                    );
                    const parentText = parent.textContent;
                    let openIndex = parentText.lastIndexOf('[[', localCursor);

                    while (openIndex > 0 && parentText[openIndex - 1] === '[') {
                        openIndex -= 1;
                    }

                    const closeIndex =
                        openIndex === -1
                            ? -1
                            : parentText.indexOf(']]', openIndex + 2);
                    const cursorInsideRawWikiLink =
                        openIndex !== -1 &&
                        closeIndex !== -1 &&
                        localCursor >= openIndex + 2 &&
                        localCursor <= closeIndex;

                    if (cursorInsideRawWikiLink) {
                        effectiveQuery = parentText
                            .slice(openIndex + 2, closeIndex)
                            .trim();
                    }

                    const { rawPath, rawHeading } = parseWikiLinkQuery(effectiveQuery);
                    const normalized = normalizeQuery(rawPath);
                    const existingTargetPaths = new Set<string>();
                    const existingItems: BlockWikiLinkSuggestionItem[] = [];
                    const resolvedTargetPath =
                        normalizeJournalTargetPath(rawPath) ||
                        normalizeNoteTargetPath(rawPath);
                    const noteForHeadingQuery = resolvedTargetPath
                        ? this.options.notes.find(
                              (note) =>
                                  deriveTargetPathFromNote(note).toLowerCase() ===
                                  resolvedTargetPath.toLowerCase(),
                          ) ?? null
                        : null;
                    const hasHeadingQuery = effectiveQuery.includes('#');

                    this.options.notes.forEach((note) => {
                        const targetPath = deriveTargetPathFromNote(note);
                        const subtitle =
                            note.path ||
                            editableJournalPathFromTargetPath(targetPath) ||
                            targetPath;

                        if (
                            normalized &&
                            !note.title.toLowerCase().includes(normalized) &&
                            !subtitle.toLowerCase().includes(normalized) &&
                            !targetPath.toLowerCase().includes(normalized)
                        ) {
                            return;
                        }

                        const key = targetPath.toLowerCase();
                        if (existingTargetPaths.has(key)) {
                            return;
                        }
                        existingTargetPaths.add(key);

                        existingItems.push({
                            id: note.id,
                            title: note.title,
                            targetPath,
                            targetBlockId: null,
                            noteId: note.id,
                            href:
                                note.href ||
                                    fallbackBlockWikiHrefFromTargetPath(targetPath, note.id),
                            subtitle,
                            kind: targetPath.startsWith('journal/')
                                ? 'journal'
                                : 'note',
                            insertText: note.title,
                        });
                    });

                    if (hasHeadingQuery && noteForHeadingQuery && resolvedTargetPath) {
                        const headingQuery = normalizeHeadingText(rawHeading);
                        const headings = Array.isArray(noteForHeadingQuery.headings)
                            ? noteForHeadingQuery.headings
                            : [];
                        const displayPath =
                            editableJournalPathFromTargetPath(resolvedTargetPath) ||
                            resolvedTargetPath;
                        const headingItems = headings
                            .filter(
                                (heading) =>
                                    heading.id &&
                                    heading.title &&
                                    (
                                        headingQuery === '' ||
                                        normalizeHeadingText(heading.title).includes(
                                            headingQuery,
                                        )
                                    ),
                            )
                            .map((heading) => ({
                                id: `${noteForHeadingQuery.id}#${heading.id}`,
                                title: heading.title,
                                targetPath: resolvedTargetPath,
                                targetBlockId: heading.id,
                                noteId: noteForHeadingQuery.id,
                                href: fallbackBlockWikiHrefFromTargetPath(
                                    resolvedTargetPath,
                                    noteForHeadingQuery.id,
                                    heading.id,
                                ),
                                subtitle: `${displayPath}# ${heading.title}`,
                                kind: 'heading' as const,
                                insertText: `${noteForHeadingQuery.title} # ${heading.title}`,
                            }));

                        return headingItems.slice(0, 8);
                    }

                    const journalItems =
                        rawPath.length >= 3
                            ? buildProgressiveJournalSuggestions(
                                  rawPath,
                                  existingTargetPaths,
                                  this.options.language,
                              )
                            : [];

                    const normalizedJournal = normalizeJournalTargetPath(rawPath);
                    const trimmedRawPath = rawPath.trim().replace(/^\/+|\/+$/g, '');
                    const isJournalScopedInput = trimmedRawPath.startsWith('journal/');
                    const normalizedNote = isJournalScopedInput
                        ? ''
                        : normalizeNoteTargetPath(rawPath);
                    const targetPath = normalizedJournal || normalizedNote;

                    const createItem =
                        targetPath &&
                        !existingTargetPaths.has(targetPath.toLowerCase())
                            ? ({
                                  id: `create:${targetPath}`,
                                  title: displayTitleFromTargetPath(
                                      targetPath,
                                      this.options.language,
                                  ),
                                  targetPath,
                                  targetBlockId: null,
                                  noteId: null,
                                  href: fallbackBlockWikiHrefFromTargetPath(targetPath),
                                  subtitle: targetPath.startsWith('journal/')
                                      ? 'Open or create journal target'
                                      : 'Create unresolved target',
                                  kind: targetPath.startsWith('journal/')
                                      ? 'journal'
                                      : 'create',
                                  insertText: displayTitleFromTargetPath(
                                      targetPath,
                                      this.options.language,
                                  ),
                              } as BlockWikiLinkSuggestionItem)
                            : null;

                    return [
                        ...existingItems,
                        ...journalItems,
                        ...(createItem ? [createItem] : []),
                    ].slice(0, 8);
                },
                command: ({ editor, range, props }) => {
                    let replaceFrom = range.from;
                    let replaceTo = range.to;
                    const { state } = editor;
                    const parent = state.selection.$from.parent;
                    const parentStart = state.selection.$from.start();
                    const localFrom = Math.max(0, range.from - parentStart);
                    const localTo = Math.max(localFrom, range.to - parentStart);

                    const parentText = parent.textContent;
                    let openIndex = parentText.lastIndexOf('[[', localTo);
                    while (openIndex > 0 && parentText[openIndex - 1] === '[') {
                        openIndex -= 1;
                    }

                    const closeIndex = parentText.indexOf(']]', localFrom);
                    if (openIndex !== -1 && closeIndex !== -1 && openIndex < closeIndex) {
                        let closeTo = closeIndex + 2;
                        while (closeTo < parentText.length && parentText[closeTo] === ']') {
                            closeTo += 1;
                        }

                        replaceFrom = parentStart + openIndex;
                        replaceTo = parentStart + closeTo;
                    } else {
                        for (const match of findCompleteRawWikiLinks(parentText)) {
                            const containsRange =
                                localFrom >= match.from && localTo <= match.to;
                            if (!containsRange) {
                                continue;
                            }

                            replaceFrom = parentStart + match.from;
                            replaceTo = parentStart + match.to;
                            break;
                        }
                    }

                    editor
                        .chain()
                        .focus()
                        .insertContentAt(
                            {
                                from: replaceFrom,
                                to: replaceTo,
                            },
                            [
                            {
                                type: 'text',
                                text: props.insertText,
                                marks: [
                                    {
                                        type: 'wikiLink',
                                        attrs: {
                                            noteId: props.noteId,
                                            href:
                                                props.href ||
                                                fallbackBlockWikiHrefFromTargetPath(
                                                    props.targetPath,
                                                    props.noteId,
                                                    props.targetBlockId,
                                                ),
                                            targetPath: props.targetPath,
                                            targetBlockId: props.targetBlockId ?? null,
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

                    exitSuggestion(editor.view, blockWikiLinkSuggestionPluginKey);
                },
                render: () => {
                    let component: ReactRenderer<any, any>;
                    let anchorFrom = 1;

                    return {
                        onStart: (props) => {
                            component = new ReactRenderer(BlockWikiLinkList, {
                                props,
                                editor: props.editor,
                            });
                            anchorFrom = Math.max(1, props.range.from);

                            if (!props.clientRect) {
                                return;
                            }

                            component.element.style.position = 'absolute';
                            document.body.appendChild(component.element);
                            updatePosition(props.editor, component.element, anchorFrom);
                        },
                        onUpdate(props) {
                            component.updateProps(props);

                            if (!props.clientRect) {
                                return;
                            }

                            updatePosition(props.editor, component.element, anchorFrom);
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
