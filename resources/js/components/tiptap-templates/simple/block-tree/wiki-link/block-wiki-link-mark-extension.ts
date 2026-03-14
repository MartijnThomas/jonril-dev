import { router } from '@inertiajs/react';
import { Mark, mergeAttributes } from '@tiptap/core';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import type { BlockWikiLinkNote } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';
import {
    displayTitleFromTargetPath,
    deriveTargetPathFromNote,
    fallbackBlockWikiHrefFromTargetPath,
    findCompleteRawWikiLinks,
    normalizeHeadingText,
    normalizeJournalTargetPath,
    normalizeNoteTargetPath,
    parseWikiLinkQuery,
    wikiLinkEditableQueryFromTarget,
} from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';

export type BlockWikiLinkAttributes = {
    noteId?: string | null;
    href?: string | null;
    targetPath?: string | null;
    targetBlockId?: string | null;
};

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        blockWikiLink: {
            setBlockWikiLink: (attributes: BlockWikiLinkAttributes) => ReturnType;
            unsetBlockWikiLink: () => ReturnType;
        };
    }
}

export const BlockWikiLinkMark = Mark.create<{
    notes: BlockWikiLinkNote[];
    language: string;
}>({
    name: 'wikiLink',

    inclusive: false,

    addOptions() {
        return {
            notes: [],
            language: 'nl',
        };
    },

    addAttributes() {
        return {
            noteId: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-note-id'),
                renderHTML: (attributes: BlockWikiLinkAttributes) => ({
                    'data-note-id': attributes.noteId,
                }),
            },
            href: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-href'),
                renderHTML: (attributes: BlockWikiLinkAttributes) => ({
                    'data-href': attributes.href,
                }),
            },
            targetPath: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-target-path'),
                renderHTML: (attributes: BlockWikiLinkAttributes) => ({
                    'data-target-path': attributes.targetPath,
                }),
            },
            targetBlockId: {
                default: null,
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-target-block-id'),
                renderHTML: (attributes: BlockWikiLinkAttributes) => ({
                    'data-target-block-id': attributes.targetBlockId,
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
                spellcheck: 'false',
            }),
            0,
        ];
    },

    addCommands() {
        return {
            setBlockWikiLink:
                (attributes) =>
                ({ commands }) =>
                    commands.setMark(this.name, attributes),
            unsetBlockWikiLink:
                () =>
                ({ commands }) =>
                    commands.unsetMark(this.name),
        };
    },

    addProseMirrorPlugins() {
        const buildNotesByTargetPath = () => {
            const notesByTargetPath = new Map<
                string,
                {
                    id: string;
                    href?: string;
                    title: string;
                    targetPath: string;
                    headings: {
                        id: string;
                        title: string;
                        level: number | null;
                    }[];
                }
            >();

            for (const note of this.options.notes) {
                const targetPath = deriveTargetPathFromNote(note);
                if (!targetPath) {
                    continue;
                }

                notesByTargetPath.set(targetPath.toLowerCase(), {
                    id: note.id,
                    href: note.href,
                    title: note.title,
                    targetPath,
                    headings: Array.isArray(note.headings) ? note.headings : [],
                });
            }

            return notesByTargetPath;
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

        const getWikiLinkAtPosition = (
            state: any,
            pos: number,
        ): { range: { from: number; to: number }; mark: any } | null => {
            const markType = state.schema.marks.wikiLink;
            if (!markType) {
                return null;
            }

            const probes = [pos, pos - 1, pos + 1];
            for (const probe of probes) {
                if (probe < 1 || probe > state.doc.content.size) {
                    continue;
                }

                const range = findWikiLinkRange(state, probe);
                if (!range) {
                    continue;
                }

                const $from = state.doc.resolve(range.from);
                const nodeAfter = $from.nodeAfter;
                if (!nodeAfter || !nodeAfter.isText) {
                    continue;
                }

                const mark = markType.isInSet(nodeAfter.marks);
                if (!mark) {
                    continue;
                }

                return { range, mark };
            }

            return null;
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

        const resolveMarkHref = (mark: any): string => {
            const targetPath = String(mark.attrs.targetPath || '').trim();
            const noteId =
                typeof mark.attrs.noteId === 'string'
                    ? mark.attrs.noteId.trim()
                    : null;
            const targetBlockId =
                typeof mark.attrs.targetBlockId === 'string'
                    ? mark.attrs.targetBlockId.trim()
                    : '';
            const rawHref = String(mark.attrs.href || '').trim();
            const fallbackHref = fallbackBlockWikiHrefFromTargetPath(
                targetPath,
                noteId,
                targetBlockId || null,
            );
            const baseHref = rawHref || fallbackHref;

            if (targetBlockId === '' || baseHref.includes('#')) {
                return baseHref;
            }

            return `${baseHref}#${encodeURIComponent(targetBlockId)}`;
        };

        const openWikiLinkForEditing = (
            view: any,
            range: { from: number; to: number },
            mark: any,
        ): void => {
            const notesByTargetPath = buildNotesByTargetPath();
            const currentText = view.state.doc.textBetween(range.from, range.to);
            let targetPath = String(
                mark.attrs.targetPath || mark.attrs.noteId || currentText,
            ).trim();
            const looksLikeUuid =
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    targetPath,
                );
            if (looksLikeUuid && typeof mark.attrs.noteId === 'string') {
                const resolvedById = Array.from(notesByTargetPath.values()).find(
                    (note) => note.id === mark.attrs.noteId,
                );
                if (resolvedById) {
                    targetPath = resolvedById.targetPath;
                }
            }
            const targetBlockId =
                typeof mark.attrs.targetBlockId === 'string'
                    ? mark.attrs.targetBlockId.trim()
                    : '';
            const resolved = notesByTargetPath.get(targetPath.toLowerCase());
            const headingTitle =
                targetBlockId && resolved
                    ? (resolved.headings ?? []).find(
                          (heading) =>
                              normalizeHeadingText(String(heading.id ?? '')) ===
                              normalizeHeadingText(targetBlockId),
                      )?.title ?? null
                    : null;
            const replacement = `[[${wikiLinkEditableQueryFromTarget(
                targetPath || currentText,
                headingTitle,
            )}]]`;
            const tr = view.state.tr.insertText(replacement, range.from, range.to);
            tr.setSelection(
                TextSelection.create(
                    tr.doc,
                    Math.max(range.from + 2, range.from + replacement.length - 2),
                ),
            );
            view.dispatch(tr);
            view.focus();
        };

        let arrowNavigationPendingEdit = false;

        return [
            new Plugin({
                props: {
                    handleKeyDown: (view, event) => {
                        const { state } = view;
                        const markType = state.schema.marks.wikiLink;

                        if (!markType || !state.selection.empty) {
                            return false;
                        }

                        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                            arrowNavigationPendingEdit = true;

                            window.setTimeout(() => {
                                if (!arrowNavigationPendingEdit || !view.hasFocus()) {
                                    return;
                                }

                                const cursor = view.state.selection.from;
                                const wikiLinkAtCursor = getWikiLinkAtPosition(
                                    view.state,
                                    cursor,
                                );

                                const cursorInsideWikiLink = wikiLinkAtCursor
                                    ? cursor > wikiLinkAtCursor.range.from &&
                                      cursor < wikiLinkAtCursor.range.to
                                    : false;

                                if (wikiLinkAtCursor && cursorInsideWikiLink) {
                                    openWikiLinkForEditing(
                                        view,
                                        wikiLinkAtCursor.range,
                                        wikiLinkAtCursor.mark,
                                    );
                                }

                                arrowNavigationPendingEdit = false;
                            }, 0);

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
                    handleClick: (view, pos, event) => {
                        const mouseEvent = event as MouseEvent;
                        const target = mouseEvent.target as HTMLElement | null;
                        const element = target?.closest<HTMLElement>(
                            '[data-wikilink="true"]',
                        );

                        if (!element) {
                            return false;
                        }

                        const wikiLinkAtPosition = getWikiLinkAtPosition(
                            view.state,
                            pos,
                        );
                        if (!wikiLinkAtPosition) {
                            return false;
                        }

                        const href = resolveMarkHref(wikiLinkAtPosition.mark);

                        if (!href) {
                            return false;
                        }

                        mouseEvent.preventDefault();
                        router.visit(href, {
                            preserveScroll: false,
                            preserveState: false,
                        });

                        return true;
                    },
                },
                appendTransaction: (transactions, _oldState, newState) => {
                    if (transactions.length === 0) {
                        return null;
                    }

                    const notesByTargetPath = buildNotesByTargetPath();

                    if (notesByTargetPath.size === 0) {
                        return null;
                    }

                    const markType = newState.schema.marks.wikiLink;
                    if (!markType) {
                        return null;
                    }

                    const tr = newState.tr;
                    let changed = false;

                    const pendingTextWikiLinks: Array<{
                        from: number;
                        to: number;
                        displayText: string;
                        targetPath: string;
                        targetHeading: string;
                    }> = [];

                    newState.doc.descendants((node, pos) => {
                        if (node.isText && node.marks.length === 0) {
                            const rawText = node.text ?? '';
                            if (rawText !== '') {
                                for (const match of findCompleteRawWikiLinks(rawText)) {
                                    const { rawPath, rawHeading } = parseWikiLinkQuery(
                                        match.inner,
                                    );
                                    const trimmedRawPath = rawPath
                                        .trim()
                                        .replace(/^\/+|\/+$/g, '');
                                    const targetPath =
                                        normalizeJournalTargetPath(rawPath) ||
                                        (trimmedRawPath.startsWith('journal/')
                                            ? ''
                                            : normalizeNoteTargetPath(rawPath));
                                    if (!targetPath) {
                                        continue;
                                    }

                                    const absoluteFrom = pos + match.from;
                                    const absoluteTo = pos + match.to;
                                    const selectionFrom = newState.selection.from;
                                    const selectionTo = newState.selection.to;
                                    const cursorInsidePattern =
                                        selectionFrom >= absoluteFrom &&
                                        selectionTo <= absoluteTo;

                                    if (cursorInsidePattern) {
                                        continue;
                                    }

                                    pendingTextWikiLinks.push({
                                        from: absoluteFrom,
                                        to: absoluteTo,
                                        displayText: displayTitleFromTargetPath(
                                            targetPath,
                                            this.options.language,
                                        ),
                                        targetPath,
                                        targetHeading: rawHeading,
                                    });
                                }
                            }

                            return true;
                        }

                        if (!node.isText || node.marks.length === 0) {
                            return true;
                        }

                        const wikiMark = markType.isInSet(node.marks);
                        if (!wikiMark) {
                            return true;
                        }

                        const targetPath = String(
                            wikiMark.attrs.targetPath ?? '',
                        ).trim();
                        if (targetPath === '') {
                            return true;
                        }

                        const resolved = notesByTargetPath.get(
                            targetPath.toLowerCase(),
                        );
                        if (!resolved) {
                            return true;
                        }

                        const targetBlockId =
                            typeof wikiMark.attrs.targetBlockId === 'string'
                                ? wikiMark.attrs.targetBlockId.trim()
                                : '';
                        const expectedHref =
                            targetBlockId !== ''
                                ? fallbackBlockWikiHrefFromTargetPath(
                                      targetPath,
                                      resolved.id,
                                      targetBlockId,
                                  )
                                : resolved.href ||
                                  fallbackBlockWikiHrefFromTargetPath(
                                      targetPath,
                                      resolved.id,
                                  );
                        const currentNoteId = wikiMark.attrs.noteId ?? null;
                        const currentHref = wikiMark.attrs.href ?? null;

                        if (
                            currentNoteId === resolved.id &&
                            currentHref === expectedHref
                        ) {
                            return true;
                        }

                        const from = pos;
                        const to = from + node.nodeSize;
                        tr.removeMark(from, to, markType);
                        tr.addMark(
                            from,
                            to,
                            markType.create({
                                ...wikiMark.attrs,
                                noteId: resolved.id,
                                href: expectedHref,
                                targetPath,
                                targetBlockId: targetBlockId || null,
                            }),
                        );
                        changed = true;

                        return true;
                    });

                    if (pendingTextWikiLinks.length > 0) {
                        const sorted = pendingTextWikiLinks.sort(
                            (left, right) => right.from - left.from,
                        );

                        sorted.forEach((pending) => {
                            const resolved = notesByTargetPath.get(
                                pending.targetPath.toLowerCase(),
                            );
                            const normalizedTargetHeading = normalizeHeadingText(
                                pending.targetHeading ?? '',
                            );
                            const matchedHeading =
                                normalizedTargetHeading && resolved
                                    ? (resolved.headings ?? []).find(
                                          (heading) =>
                                              normalizeHeadingText(heading.title) ===
                                              normalizedTargetHeading,
                                      ) ?? null
                                    : null;
                            if (normalizedTargetHeading && !matchedHeading) {
                                return;
                            }
                            const targetBlockId = matchedHeading?.id ?? null;
                            const href =
                                targetBlockId
                                    ? fallbackBlockWikiHrefFromTargetPath(
                                          pending.targetPath,
                                          resolved?.id,
                                          targetBlockId,
                                      )
                                    : resolved?.href ||
                                      fallbackBlockWikiHrefFromTargetPath(
                                          pending.targetPath,
                                          resolved?.id,
                                      );
                            const noteId = resolved?.id ?? null;
                            const displayText =
                                matchedHeading && resolved
                                    ? `${resolved.title} # ${matchedHeading.title}`
                                    : matchedHeading?.title ??
                                      resolved?.title ??
                                      pending.displayText;

                            tr.insertText(displayText, pending.from, pending.to);
                            tr.addMark(
                                pending.from,
                                pending.from + displayText.length,
                                markType.create({
                                    noteId,
                                    href,
                                    targetPath: pending.targetPath,
                                    targetBlockId,
                                }),
                            );
                            changed = true;
                        });
                    }

                    return changed ? tr : null;
                },
            }),
        ];
    },
});
