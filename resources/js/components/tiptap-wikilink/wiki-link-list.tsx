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

type WikiLinkItem = {
    id: string;
    title: string;
    path?: string;
};

type WikiLinkListProps = {
    items: WikiLinkItem[];
    command: (item: WikiLinkItem) => void;
};

export const WikiLinkList = forwardRef<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }, WikiLinkListProps>(
    ({ items, command }, ref) => {
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
            <Command className="w-72 rounded-md border bg-popover text-popover-foreground shadow-md">
                <CommandList>
                    <CommandEmpty>No notes found</CommandEmpty>
                    <CommandGroup heading="Notes">
                        {items.map((item, index) => (
                            <CommandItem
                                key={item.id}
                                value={item.title}
                                onSelect={() => selectItem(index)}
                                onMouseEnter={() => setSelectedIndex(index)}
                                className={
                                    index === safeIndex
                                        ? 'bg-accent text-accent-foreground'
                                        : ''
                                }
                            >
                                <div className="flex flex-col">
                                    <span>{item.title}</span>
                                    {item.path && (
                                        <span className="text-xs text-muted-foreground">
                                            {item.path}
                                        </span>
                                    )}
                                </div>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                </CommandList>
            </Command>
        );
    },
);

WikiLinkList.displayName = 'WikiLinkList';
