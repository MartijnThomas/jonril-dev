import { computePosition, flip, shift } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import { posToDOMRect } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BlockWikiLinkList } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-list';
import type {
    BlockWikiLinkNote,
    BlockWikiLinkSuggestionItem,
} from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';
import {
    buildBlockWikiLinkSuggestions,
    fallbackBlockWikiHrefFromTargetPath,
    findCompleteRawWikiLinks,
} from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';

declare global {
    interface Window {
        __sarthBlockWikiLinkSuggestionActive?: boolean;
        __sarthBlockWikiLinkEnterHandledAt?: number;
    }
}

type BlockWikiLinkSuggestionMenuProps = {
    editor: Editor;
    notes: BlockWikiLinkNote[];
    language: string;
};

type ActiveWikiLinkQuery = {
    from: number;
    to: number;
    query: string;
    blockStyle: string | null;
};

function getActiveWikiLinkQuery(editor: Editor): ActiveWikiLinkQuery | null {
    const { state } = editor;
    const { from, to, $from } = state.selection;

    if (from !== to) {
        return null;
    }

    const parent = $from.parent;
    if (parent.type.name !== 'paragraph' && parent.type.name !== 'heading') {
        return null;
    }

    const parentText = parent.textContent;
    const parentStart = $from.start();
    const localCursor = $from.parentOffset;

    for (const match of findCompleteRawWikiLinks(parentText)) {
        const contentFrom = match.from + 2;
        const contentTo = match.to - 2;
        if (localCursor < contentFrom || localCursor > contentTo) {
            continue;
        }

        return {
            from: parentStart + match.from,
            to: parentStart + match.to,
            query: match.inner,
            blockStyle: parent.type.name === 'paragraph'
                ? (typeof parent.attrs?.blockStyle === 'string'
                    ? parent.attrs.blockStyle
                    : 'paragraph')
                : null,
        };
    }

    let openIndex = parentText.lastIndexOf('[[', localCursor);
    while (openIndex > 0 && parentText[openIndex - 1] === '[') {
        openIndex -= 1;
    }

    if (openIndex === -1) {
        return null;
    }

    const closeIndex = parentText.indexOf(']]', openIndex + 2);
    if (closeIndex !== -1) {
        return null;
    }

    if (localCursor < openIndex + 2) {
        return null;
    }

    return {
        from: parentStart + openIndex,
        to: parentStart + localCursor,
        query: parentText.slice(openIndex + 2, localCursor).trim(),
        blockStyle: parent.type.name === 'paragraph'
            ? (typeof parent.attrs?.blockStyle === 'string'
                ? parent.attrs.blockStyle
                : 'paragraph')
            : null,
    };
}

export function BlockWikiLinkSuggestionMenu({
    editor,
    notes,
    language,
}: BlockWikiLinkSuggestionMenuProps) {
    const [activeQuery, setActiveQuery] = useState<ActiveWikiLinkQuery | null>(null);
    const activeQueryRef = useRef<ActiveWikiLinkQuery | null>(null);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const listRef = useRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean } | null>(
        null,
    );
    const isComposingRef = useRef(false);

    const items = useMemo(() => {
        if (!activeQuery) {
            return [];
        }

        return buildBlockWikiLinkSuggestions(notes, activeQuery.query, language);
    }, [activeQuery, language, notes]);

    useEffect(() => {
        const onCompositionStart = () => {
            isComposingRef.current = true;
        };
        const onCompositionEnd = () => {
            isComposingRef.current = false;
        };

        document.addEventListener('compositionstart', onCompositionStart);
        document.addEventListener('compositionend', onCompositionEnd);

        return () => {
            document.removeEventListener('compositionstart', onCompositionStart);
            document.removeEventListener('compositionend', onCompositionEnd);
        };
    }, []);

    useEffect(() => {
        const update = () => {
            if (isComposingRef.current) {
                return;
            }

            const nextQuery = getActiveWikiLinkQuery(editor);
            const prevQuery = activeQueryRef.current;

            if (
                nextQuery &&
                prevQuery &&
                nextQuery.from === prevQuery.from &&
                nextQuery.to <= prevQuery.to &&
                editor.state.selection.empty &&
                editor.state.selection.from === nextQuery.from
            ) {
                editor.commands.setTextSelection(prevQuery.to);
                return;
            }

            // Skip re-render when the query hasn't changed by value
            if (
                nextQuery?.from === prevQuery?.from &&
                nextQuery?.to === prevQuery?.to &&
                nextQuery?.query === prevQuery?.query
            ) {
                return;
            }

            activeQueryRef.current = nextQuery;
            setPosition(null);
            setActiveQuery(nextQuery);
        };

        update();
        editor.on('selectionUpdate', update);
        editor.on('update', update);

        return () => {
            editor.off('selectionUpdate', update);
            editor.off('update', update);
        };
    }, [editor]);

    useEffect(() => {
        window.__sarthBlockWikiLinkSuggestionActive =
            Boolean(activeQuery) && items.length > 0;

        return () => {
            window.__sarthBlockWikiLinkSuggestionActive = false;
        };
    }, [activeQuery, items.length]);

    useEffect(() => {
        if (!activeQuery || items.length === 0 || !containerRef.current) {
            return;
        }

        const virtualElement = {
            getBoundingClientRect: () =>
                posToDOMRect(editor.view, activeQuery.from, activeQuery.to),
        };

        computePosition(virtualElement, containerRef.current, {
            placement: 'bottom-start',
            strategy: 'fixed',
            middleware: [shift(), flip()],
        }).then(({ x, y }) => {
            setPosition({ left: x, top: y });
        });
    }, [activeQuery, editor, items.length]);

    useEffect(() => {
        if (!activeQuery || items.length === 0) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!editor.isFocused) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                setActiveQuery(null);
                return;
            }

            if (
                event.key !== 'ArrowUp' &&
                event.key !== 'ArrowDown' &&
                event.key !== 'Enter'
            ) {
                return;
            }

            const handled = listRef.current?.onKeyDown({ event }) ?? false;
            if (handled) {
                window.__sarthBlockWikiLinkEnterHandledAt =
                    event.key === 'Enter' ? Date.now() : 0;
                event.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [activeQuery, editor, items.length]);

    if (!activeQuery || items.length === 0) {
        return null;
    }

    const command = (item: BlockWikiLinkSuggestionItem) => {
        const preservedBlockStyle =
            activeQuery.blockStyle && activeQuery.blockStyle !== 'paragraph'
                ? activeQuery.blockStyle
                : null;

        editor
            .chain()
            .focus()
            .insertContentAt(
                {
                    from: activeQuery.from,
                    to: activeQuery.to,
                },
                [
                    {
                        type: 'text',
                        text: item.insertText,
                        marks: [
                            {
                                type: 'wikiLink',
                                attrs: {
                                    noteId: item.noteId ?? null,
                                    href:
                                        item.href ||
                                        fallbackBlockWikiHrefFromTargetPath(
                                            item.targetPath,
                                            item.noteId,
                                            item.targetBlockId,
                                        ),
                                    targetPath: item.targetPath,
                                    targetBlockId: item.targetBlockId ?? null,
                                    crossWorkspace: item.isCrossWorkspace ?? false,
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

        if (preservedBlockStyle) {
            editor.commands.command(({ state, tr, dispatch }) => {
                const $from = state.selection.$from;
                if ($from.parent.type.name !== 'paragraph') {
                    return false;
                }

                const paragraphPos = $from.before();
                const paragraphNode = state.doc.nodeAt(paragraphPos);
                if (!paragraphNode || paragraphNode.type.name !== 'paragraph') {
                    return false;
                }

                dispatch?.(
                    tr.setNodeMarkup(paragraphPos, undefined, {
                        ...paragraphNode.attrs,
                        blockStyle: preservedBlockStyle,
                    }),
                );

                return true;
            });
        }

        setActiveQuery(null);
    };

    return createPortal(
        <div
            ref={containerRef}
            data-block-wiki-link-suggestion="true"
            style={{
                position: 'fixed',
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                visibility: position ? 'visible' : 'hidden',
                zIndex: 50,
            }}
        >
            <BlockWikiLinkList
                ref={listRef}
                items={items}
                command={command}
            />
        </div>,
        document.body,
    );
}
