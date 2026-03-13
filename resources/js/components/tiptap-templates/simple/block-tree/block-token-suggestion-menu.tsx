import { computePosition, flip, shift } from '@floating-ui/dom';
import type { Editor } from '@tiptap/core';
import { posToDOMRect } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { TokenSuggestionItem } from '@/components/tiptap-mention/token-suggestion-list';
import {
    TokenSuggestionList,
} from '@/components/tiptap-mention/token-suggestion-list';

type WorkspaceSuggestions = {
    mentions: string[];
    hashtags: string[];
};

type BlockTokenSuggestionMenuProps = {
    editor: Editor;
    workspaceSuggestions: WorkspaceSuggestions;
};

type ActiveToken = {
    char: '@' | '#';
    from: number;
    to: number;
    query: string;
};

function getActiveToken(editor: Editor): ActiveToken | null {
    const { state } = editor;
    const { from, to, $from } = state.selection;

    if (from !== to) {
        return null;
    }

    const parent = $from.parent;
    if (parent.type.name !== 'paragraph' && parent.type.name !== 'heading') {
        return null;
    }

    const beforeText = parent.textContent.slice(0, $from.parentOffset);
    const match = beforeText.match(/(^|[\s([{'"])([@#][\p{L}\p{N}_-]*)$/u);

    if (!match) {
        return null;
    }

    const token = match[2] ?? '';

    if (token.length === 0) {
        return null;
    }

    const tokenStart = beforeText.length - token.length;

    return {
        char: token.startsWith('@') ? '@' : '#',
        from: $from.start() + tokenStart,
        to: $from.start() + $from.parentOffset,
        query: token.slice(1),
    };
}

function toSuggestionItems(items: string[], query: string): TokenSuggestionItem[] {
    const normalizedQuery = query.trim().toLowerCase();

    return items
        .filter((item) => item.toLowerCase().startsWith(normalizedQuery))
        .slice(0, 8)
        .map((item) => ({
            id: item,
            label: item,
        }));
}

export function BlockTokenSuggestionMenu({
    editor,
    workspaceSuggestions,
}: BlockTokenSuggestionMenuProps) {
    const [activeToken, setActiveToken] = useState<ActiveToken | null>(null);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const listRef = useRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean } | null>(
        null,
    );
    const containerRef = useRef<HTMLDivElement | null>(null);

    const items = useMemo(() => {
        if (!activeToken) {
            return [];
        }

        return toSuggestionItems(
            activeToken.char === '@'
                ? workspaceSuggestions.mentions
                : workspaceSuggestions.hashtags,
            activeToken.query,
        );
    }, [activeToken, workspaceSuggestions.hashtags, workspaceSuggestions.mentions]);

    useEffect(() => {
        const update = () => {
            const nextToken = getActiveToken(editor);
            setPosition(null);
            setActiveToken(nextToken);
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
        if (!activeToken || items.length === 0 || !containerRef.current) {
            return;
        }

        const virtualElement = {
            getBoundingClientRect: () =>
                posToDOMRect(editor.view, activeToken.from, activeToken.to),
        };

        computePosition(virtualElement, containerRef.current, {
            placement: 'bottom-start',
            strategy: 'fixed',
            middleware: [shift(), flip()],
        }).then(({ x, y }) => {
            setPosition({ left: x, top: y });
        });
    }, [activeToken, editor.view, editor, items.length]);

    useEffect(() => {
        if (!activeToken || items.length === 0) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!editor.isFocused) {
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                setActiveToken(null);
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
                event.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
        };
    }, [activeToken, editor, items.length]);

    if (!activeToken || items.length === 0) {
        return null;
    }

    const heading = activeToken.char === '@' ? 'Mentions' : 'Hashtags';

    const command = (item: TokenSuggestionItem) => {
        editor
            .chain()
            .focus()
            .insertContentAt(
                { from: activeToken.from, to: activeToken.to },
                `${activeToken.char}${item.label} `,
            )
            .run();

        setActiveToken(null);
    };

    return createPortal(
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                left: position?.left ?? 0,
                top: position?.top ?? 0,
                visibility: position ? 'visible' : 'hidden',
                zIndex: 50,
            }}
        >
            <TokenSuggestionList
                ref={listRef}
                heading={heading}
                char={activeToken.char}
                items={items}
                command={command}
            />
        </div>,
        document.body,
    );
}
