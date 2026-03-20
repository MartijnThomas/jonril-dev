import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
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
    const safeIndex = useMemo(
        () => (items.length > 0 ? Math.min(selectedIndex, items.length - 1) : 0),
        [items.length, selectedIndex],
    );

    useEffect(() => {
        setSelectedIndex(0);
    }, [items]);

    const selectItem = (index: number) => {
        const item = items[index];
        if (item) {
            command(item);
        }
    };

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }) => {
            if (items.length === 0) {
                return false;
            }

            if (event.key === 'ArrowUp') {
                setSelectedIndex((current) => (current + items.length - 1) % items.length);
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
        <Command className="w-80 rounded-md border bg-popover text-popover-foreground shadow-md">
            <CommandList>
                <CommandEmpty>No wiki-link targets found</CommandEmpty>
                <CommandGroup heading="Wiki links">
                    {items.map((item, index) => (
                        <CommandItem
                            key={item.id}
                            value={`${item.title} ${item.workspaceName ?? ''} ${item.subtitle ?? ''}`}
                            onSelect={() => selectItem(index)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`flex flex-col items-start ${
                                index === safeIndex ? 'bg-accent text-accent-foreground' : ''
                            }`}
                        >
                            <span>{item.title}</span>
                            {item.subtitle && (
                                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                    {item.isCrossWorkspace && item.workspaceName ? (
                                        <span className="inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                            {item.workspaceName}
                                        </span>
                                    ) : null}
                                    <span>{item.subtitle}</span>
                                </span>
                            )}
                        </CommandItem>
                    ))}
                </CommandGroup>
            </CommandList>
        </Command>
    );
});

BlockWikiLinkList.displayName = 'BlockWikiLinkList';
