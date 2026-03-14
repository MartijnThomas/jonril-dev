import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import type { BlockWikiLinkSuggestionItem } from '@/components/tiptap-templates/simple/block-tree/wiki-link/block-wiki-link-utils';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

type BlockWikiLinkListProps = {
    items: BlockWikiLinkSuggestionItem[];
    command: (item: BlockWikiLinkSuggestionItem) => void;
};

export const BlockWikiLinkList = forwardRef<
    { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
    BlockWikiLinkListProps
>(({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const hasItems = items.length > 0;

    const safeIndex = useMemo(() => {
        if (!hasItems) {
            return 0;
        }

        return Math.min(selectedIndex, items.length - 1);
    }, [hasItems, items.length, selectedIndex]);

    const itemsKey = useMemo(() => items.map((item) => item.id).join('|'), [items]);

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
                setSelectedIndex((current) =>
                    (current + items.length - 1) % items.length,
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
        <Command
            key={itemsKey}
            className="w-80 rounded-md border bg-popover text-popover-foreground shadow-md"
        >
            <CommandList>
                <CommandEmpty>No wiki-link targets found</CommandEmpty>
                <CommandGroup heading="Wiki links">
                    {items.map((item, index) => (
                        <CommandItem
                            key={item.id}
                            value={`${item.title} ${item.targetPath}`}
                            onSelect={() => selectItem(index)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={
                                index === safeIndex
                                    ? 'bg-accent text-accent-foreground'
                                    : 'data-[selected=true]:bg-transparent data-[selected=true]:text-foreground'
                            }
                        >
                            <div className="flex flex-col">
                                <span>{item.title}</span>
                                {item.subtitle && (
                                    <span className="text-xs text-muted-foreground">
                                        {item.subtitle}
                                    </span>
                                )}
                            </div>
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
});

BlockWikiLinkList.displayName = 'BlockWikiLinkList';
