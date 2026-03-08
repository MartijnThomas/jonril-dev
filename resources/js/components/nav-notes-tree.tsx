import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import { getColorBgClass, getColorTextClass } from '@/components/color-swatch-picker';
import { getWorkspaceIconComponent } from '@/components/icon-picker';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Icon } from '@/components/ui/icon';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { cn } from '@/lib/utils';
import type { SidebarNoteTreeItem } from '@/types';

type NotesTreeProps = {
    items: SidebarNoteTreeItem[];
};

function hasActiveInBranch(
    item: SidebarNoteTreeItem,
    isCurrentUrl: ReturnType<typeof useCurrentUrl>['isCurrentUrl'],
): boolean {
    if (isCurrentUrl(item.href)) {
        return true;
    }

    return item.children.some((child) => hasActiveInBranch(child, isCurrentUrl));
}

function RootNoteItem({ item }: { item: SidebarNoteTreeItem }) {
    const { isCurrentUrl } = useCurrentUrl();
    const isActive = isCurrentUrl(item.href);
    const hasChildren = item.children.length > 0;
    const defaultOpen = useMemo(
        () =>
            hasChildren &&
            item.children.some((child) => hasActiveInBranch(child, isCurrentUrl)),
        [hasChildren, isCurrentUrl, item.children],
    );
    const [open, setOpen] = useState(defaultOpen);
    const NoteIcon = item.icon
        ? getWorkspaceIconComponent(item.icon)
        : FileText;
    const iconColorClass = getColorTextClass(item.icon_color ?? null);
    const iconBgClass = getColorBgClass(item.icon_bg ?? null);

    if (!hasChildren) {
        return (
            <SidebarMenuItem>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none flex h-7 w-6 shrink-0 items-center justify-center rounded-md opacity-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                    <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span>{item.title}</span>
                        </Link>
                    </SidebarMenuButton>
                </div>
            </SidebarMenuItem>
        );
    }

    return (
        <SidebarMenuItem>
            <Collapsible open={open} onOpenChange={setOpen}>
                <div className="flex items-center gap-1">
                    <CollapsibleTrigger asChild>
                        <button
                            type="button"
                            className="text-sidebar-foreground/70 hover:text-sidebar-foreground flex h-7 w-6 items-center justify-center rounded-md"
                            aria-label={`Toggle ${item.title}`}
                        >
                            {open ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </button>
                    </CollapsibleTrigger>

                    <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span>{item.title}</span>
                        </Link>
                    </SidebarMenuButton>
                </div>

                <CollapsibleContent>
                    <NoteSubTree items={item.children} />
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
}

function NoteSubTree({ items }: NotesTreeProps) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <SidebarMenuSub>
            {items.map((item) => (
                <SubTreeNode
                    key={item.id}
                    item={item}
                    isCurrentUrl={isCurrentUrl}
                />
            ))}
        </SidebarMenuSub>
    );
}

function SubTreeNode({
    item,
    isCurrentUrl,
}: {
    item: SidebarNoteTreeItem;
    isCurrentUrl: ReturnType<typeof useCurrentUrl>['isCurrentUrl'];
}) {
    const isActive = isCurrentUrl(item.href);
    const hasChildren = item.children.length > 0;
    const defaultOpen = useMemo(
        () =>
            hasChildren &&
            item.children.some((child) => hasActiveInBranch(child, isCurrentUrl)),
        [hasChildren, isCurrentUrl, item.children],
    );
    const [open, setOpen] = useState(defaultOpen);
    const NoteIcon = item.icon
        ? getWorkspaceIconComponent(item.icon)
        : FileText;
    const iconColorClass = getColorTextClass(item.icon_color ?? null);
    const iconBgClass = getColorBgClass(item.icon_bg ?? null);

    if (!hasChildren) {
        return (
            <SidebarMenuSubItem>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none flex h-7 w-6 shrink-0 items-center justify-center rounded-md opacity-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                    <SidebarMenuSubButton asChild isActive={isActive}>
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span>{item.title}</span>
                        </Link>
                    </SidebarMenuSubButton>
                </div>
            </SidebarMenuSubItem>
        );
    }

    return (
        <SidebarMenuSubItem>
            <Collapsible open={open} onOpenChange={setOpen}>
                <div className="flex items-center gap-1">
                    <CollapsibleTrigger asChild>
                        <button
                            type="button"
                            className="text-sidebar-foreground/70 hover:text-sidebar-foreground flex h-7 w-6 items-center justify-center rounded-md"
                            aria-label={`Toggle ${item.title}`}
                        >
                            {open ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </button>
                    </CollapsibleTrigger>

                    <SidebarMenuSubButton asChild isActive={isActive}>
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span>{item.title}</span>
                        </Link>
                    </SidebarMenuSubButton>
                </div>

                <CollapsibleContent>
                    <NoteSubTree items={item.children} />
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuSubItem>
    );
}

export function NavNotesTree() {
    const { notesTree } = usePage().props;
    const items = (notesTree ?? []) as SidebarNoteTreeItem[];

    return (
        <SidebarGroup className="px-2 py-0 group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Notes</SidebarGroupLabel>
            <SidebarMenu>
                {items.length === 0 && (
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            isActive={false}
                            className="text-sidebar-foreground/60"
                        >
                            <span>No notes yet</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                )}
                {items.map((item) => (
                    <RootNoteItem key={item.id} item={item} />
                ))}
            </SidebarMenu>
        </SidebarGroup>
    );
}
