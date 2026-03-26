import {
    Check,
    Code2,
    Minus,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    ImagePlus,
    List,
    ListChecks,
    ListOrdered,
    Quote,
    Pilcrow,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';

export type BlockLineAction =
    | 'paragraph'
    | 'heading-1'
    | 'heading-2'
    | 'heading-3'
    | 'heading-4'
    | 'heading-5'
    | 'heading-6'
    | 'task'
    | 'checklist'
    | 'bullet'
    | 'ordered'
    | 'quote'
    | 'code-block'
    | 'horizontal-rule'
    | 'image';

type LineActionItem = {
    value: BlockLineAction;
    label: string;
    keywords: string;
    group: 'Headings' | 'Line format';
    icon: typeof Heading1;
};

const ACTIONS: LineActionItem[] = [
    { value: 'paragraph', label: 'Paragraph', keywords: 'text line reset', group: 'Line format', icon: Pilcrow },
    { value: 'heading-1', label: 'Heading 1', keywords: 'h1 title', group: 'Headings', icon: Heading1 },
    { value: 'heading-2', label: 'Heading 2', keywords: 'h2 subtitle', group: 'Headings', icon: Heading2 },
    { value: 'heading-3', label: 'Heading 3', keywords: 'h3', group: 'Headings', icon: Heading3 },
    { value: 'heading-4', label: 'Heading 4', keywords: 'h4', group: 'Headings', icon: Heading4 },
    { value: 'heading-5', label: 'Heading 5', keywords: 'h5', group: 'Headings', icon: Heading5 },
    { value: 'heading-6', label: 'Heading 6', keywords: 'h6', group: 'Headings', icon: Heading6 },
    { value: 'task', label: 'Task', keywords: 'todo checklist', group: 'Line format', icon: ListChecks },
    { value: 'checklist', label: 'Checklist item', keywords: 'checklist check', group: 'Line format', icon: Check },
    { value: 'bullet', label: 'Bullet list item', keywords: 'list bullet', group: 'Line format', icon: List },
    { value: 'ordered', label: 'Ordered list item', keywords: 'numbered list', group: 'Line format', icon: ListOrdered },
    { value: 'quote', label: 'Blockquote', keywords: 'quote blockquote', group: 'Line format', icon: Quote },
    { value: 'code-block', label: 'Code block', keywords: 'code block snippet', group: 'Line format', icon: Code2 },
    { value: 'horizontal-rule', label: 'Horizontal rule', keywords: 'divider hr line', group: 'Line format', icon: Minus },
    { value: 'image', label: 'Image', keywords: 'image upload photo', group: 'Line format', icon: ImagePlus },
];

type BlockLineActionsMenuProps = {
    open: boolean;
    x: number;
    y: number;
    onClose: () => void;
    onSelect: (action: BlockLineAction) => void;
};

export function BlockLineActionsMenu({
    open,
    x,
    y,
    onClose,
    onSelect,
}: BlockLineActionsMenuProps) {
    useEffect(() => {
        if (!open) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose, open]);

    const style = useMemo(() => {
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
        const clampedLeft = viewportWidth > 0
            ? Math.min(Math.max(8, x), Math.max(8, viewportWidth - 300))
            : x;

        return {
            left: clampedLeft,
            top: y,
        };
    }, [x, y]);

    if (!open) {
        return null;
    }

    const headingActions = ACTIONS.filter((action) => action.group === 'Headings');
    const lineActions = ACTIONS.filter((action) => action.group === 'Line format');

    const renderItem = (action: LineActionItem) => {
        const Icon = action.icon;

        return (
            <CommandItem
                key={action.value}
                value={`${action.label} ${action.keywords}`}
                onSelect={() => {
                    onSelect(action.value);
                    onClose();
                }}
                className="gap-2"
            >
                <Icon className="size-4" />
                <span>{action.label}</span>
            </CommandItem>
        );
    };

    return (
        <>
            <button
                type="button"
                aria-label="Close line actions menu"
                className="fixed inset-0 z-50 bg-transparent"
                onClick={onClose}
            />
            <div
                className="fixed z-[60] w-[18.5rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-xl"
                style={style}
            >
                <Command shouldFilter>
                    <CommandInput autoFocus placeholder="Search actions..." />
                    <CommandList className="max-h-72">
                        <CommandEmpty>No actions found.</CommandEmpty>
                        <CommandGroup heading="Headings">
                            {headingActions.map(renderItem)}
                        </CommandGroup>
                        <CommandGroup heading="Line format">
                            {lineActions.map(renderItem)}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </div>
        </>
    );
}
