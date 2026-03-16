import {
    forwardRef,
    useImperativeHandle,
    useMemo,
    useState,
} from 'react';

export type TokenSuggestionItem = {
    id: string;
    label: string;
    isCreate?: boolean;
};

type TokenSuggestionListProps = {
    heading: string;
    char: '@' | '#';
    items: TokenSuggestionItem[];
    command: (item: TokenSuggestionItem) => void;
};

export const TokenSuggestionList = forwardRef<
    { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
    TokenSuggestionListProps
>(({ heading, char, items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const hasItems = items.length > 0;
    const safeIndex = useMemo(() => {
        if (!hasItems) {
            return 0;
        }

        return Math.min(selectedIndex, items.length - 1);
    }, [hasItems, items.length, selectedIndex]);

    const selectItem = (index: number) => {
        const item = items[index];
        if (item) {
            command(item);
        }
    };

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (!hasItems) {
                return false;
            }

            if (event.key === 'ArrowUp') {
                setSelectedIndex(
                    (current) => (current + items.length - 1) % items.length,
                );
                return true;
            }

            if (event.key === 'ArrowDown') {
                setSelectedIndex((current) => (current + 1) % items.length);
                return true;
            }

            if (event.key === 'Enter') {
                selectItem(safeIndex);
                return true;
            }

            return false;
        },
    }));

    return (
        <div className="w-64 rounded-md border bg-popover text-popover-foreground shadow-md overflow-hidden">
            {!hasItems ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No result</div>
            ) : (
                <div className="p-1">
                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{heading}</div>
                    {items.map((item, index) => (
                        <div
                            key={`${item.id}-${index}`}
                            role="option"
                            aria-selected={index === safeIndex}
                            className={`rounded-sm px-2 py-1.5 text-sm cursor-default select-none ${
                                index === safeIndex ? 'bg-accent text-accent-foreground' : ''
                            }`}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                selectItem(index);
                            }}
                        >
                            {item.isCreate
                                ? `Create ${char}${item.label}`
                                : `${char}${item.label}`}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

TokenSuggestionList.displayName = 'TokenSuggestionList';
