import {
    forwardRef,
    useImperativeHandle,
    useMemo,
    useState,
} from 'react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

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
        <Command className="w-64 rounded-md border bg-popover text-popover-foreground shadow-md">
            <CommandList>
                <CommandEmpty>No result</CommandEmpty>
                <CommandGroup heading={heading}>
                    {items.map((item, index) => (
                        <CommandItem
                            key={`${item.id}-${index}`}
                            value={item.label}
                            onSelect={() => selectItem(index)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={
                                index === safeIndex
                                    ? 'bg-accent text-accent-foreground'
                                    : ''
                            }
                        >
                            {item.isCreate
                                ? `Create ${char}${item.label}`
                                : `${char}${item.label}`}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
});

TokenSuggestionList.displayName = 'TokenSuggestionList';
