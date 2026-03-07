import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';
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

    if (!hasChildren) {
        return (
            <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive}>
                    <Link href={item.href} prefetch>
                        <FileText />
                        <span>{item.title}</span>
                    </Link>
                </SidebarMenuButton>
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
                            <FileText />
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

    if (!hasChildren) {
        return (
            <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild isActive={isActive}>
                    <Link href={item.href} prefetch>
                        <span>{item.title}</span>
                    </Link>
                </SidebarMenuSubButton>
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
        <SidebarGroup className="px-2 py-0">
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
