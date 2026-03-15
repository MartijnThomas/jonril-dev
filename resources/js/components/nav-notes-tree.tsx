import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronRight, FileText, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getColorBgClass, getColorTextClass } from '@/components/color-swatch-picker';
import {
    CreateNoteDialog,
} from '@/components/create-note-dialog';
import type { CreateNoteParentOption } from '@/components/create-note-dialog';
import { getWorkspaceIconComponent } from '@/components/icon-picker';
import { NoteHeaderActions } from '@/components/note-header-actions';
import { Button } from '@/components/ui/button';
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
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { SidebarNoteTreeItem } from '@/types';

type NotesTreeProps = {
    items: SidebarNoteTreeItem[];
    allOptions: CreateNoteParentOption[];
    parentPath: string | null;
    parentId: string | null;
    workspaceReadOnly: boolean;
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

function collectDescendantIds(items: SidebarNoteTreeItem[]): string[] {
    const ids: string[] = [];
    for (const item of items) {
        ids.push(item.id);
        ids.push(...collectDescendantIds(item.children));
    }

    return ids;
}

function RootNoteItem({
    item,
    allOptions,
    parentPath,
    parentId,
    workspaceReadOnly,
}: {
    item: SidebarNoteTreeItem;
    allOptions: CreateNoteParentOption[];
    parentPath: string | null;
    parentId: string | null;
    workspaceReadOnly: boolean;
}) {
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
    const excludedMoveTargetIds = useMemo(
        () => new Set([item.id, ...collectDescendantIds(item.children)]),
        [item.id, item.children],
    );
    const moveParentOptions = useMemo(
        () => allOptions.filter((option) => !excludedMoveTargetIds.has(option.id)),
        [allOptions, excludedMoveTargetIds],
    );
    const currentPath = parentPath ? `${parentPath} / ${item.title}` : item.title;

    if (!hasChildren) {
        return (
            <SidebarMenuItem>
                <div className="group/item relative flex items-center gap-1">
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none flex h-7 w-6 shrink-0 items-center justify-center rounded-md opacity-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                    <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className="pr-8 group-data-[collapsible=icon]:pr-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                    >
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                    </SidebarMenuButton>
                    <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                        <NoteHeaderActions
                            noteId={item.id}
                            title={item.title}
                            currentLocation={parentPath}
                            currentParentId={parentId}
                            moveParentOptions={moveParentOptions}
                            canMove={!workspaceReadOnly}
                            canRename={!workspaceReadOnly}
                            canDelete={!workspaceReadOnly}
                            canClear={!workspaceReadOnly}
                            triggerClassName="h-6 w-6 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100"
                            dropdownAlign="end"
                            dropdownSide="bottom"
                            listenForMoveEvent={false}
                        />
                    </div>
                </div>
            </SidebarMenuItem>
        );
    }

    return (
        <SidebarMenuItem>
            <Collapsible open={open} onOpenChange={setOpen}>
                <div className="group/item relative flex items-center gap-1">
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

                    <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        className="pr-8 group-data-[collapsible=icon]:pr-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                    >
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                    </SidebarMenuButton>
                    <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                        <NoteHeaderActions
                            noteId={item.id}
                            title={item.title}
                            currentLocation={parentPath}
                            currentParentId={parentId}
                            moveParentOptions={moveParentOptions}
                            canMove={!workspaceReadOnly}
                            canRename={!workspaceReadOnly}
                            canDelete={!workspaceReadOnly}
                            canClear={!workspaceReadOnly}
                            triggerClassName="h-6 w-6 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100"
                            dropdownAlign="end"
                            dropdownSide="bottom"
                            listenForMoveEvent={false}
                        />
                    </div>
                </div>

                <CollapsibleContent>
                    <NoteSubTree
                        items={item.children}
                        allOptions={allOptions}
                        parentPath={currentPath}
                        parentId={item.id}
                        workspaceReadOnly={workspaceReadOnly}
                    />
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuItem>
    );
}

function NoteSubTree({ items, allOptions, parentPath, parentId, workspaceReadOnly }: NotesTreeProps) {
    const { isCurrentUrl } = useCurrentUrl();

    return (
        <SidebarMenuSub>
            {items.map((item) => (
                <SubTreeNode
                    key={item.id}
                    item={item}
                    isCurrentUrl={isCurrentUrl}
                    allOptions={allOptions}
                    parentPath={parentPath}
                    parentId={parentId}
                    workspaceReadOnly={workspaceReadOnly}
                />
            ))}
        </SidebarMenuSub>
    );
}

function SubTreeNode({
    item,
    isCurrentUrl,
    allOptions,
    parentPath,
    parentId,
    workspaceReadOnly,
}: {
    item: SidebarNoteTreeItem;
    isCurrentUrl: ReturnType<typeof useCurrentUrl>['isCurrentUrl'];
    allOptions: CreateNoteParentOption[];
    parentPath: string | null;
    parentId: string | null;
    workspaceReadOnly: boolean;
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
    const excludedMoveTargetIds = useMemo(
        () => new Set([item.id, ...collectDescendantIds(item.children)]),
        [item.id, item.children],
    );
    const moveParentOptions = useMemo(
        () => allOptions.filter((option) => !excludedMoveTargetIds.has(option.id)),
        [allOptions, excludedMoveTargetIds],
    );
    const currentPath = parentPath ? `${parentPath} / ${item.title}` : item.title;

    if (!hasChildren) {
        return (
            <SidebarMenuSubItem>
                <div className="group/item relative flex items-center gap-1">
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none flex h-7 w-6 shrink-0 items-center justify-center rounded-md opacity-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                    <SidebarMenuSubButton
                        asChild
                        isActive={isActive}
                        className="pr-8 group-data-[collapsible=icon]:pr-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                    >
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                    </SidebarMenuSubButton>
                    <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                        <NoteHeaderActions
                            noteId={item.id}
                            title={item.title}
                            currentLocation={parentPath}
                            currentParentId={parentId}
                            moveParentOptions={moveParentOptions}
                            canMove={!workspaceReadOnly}
                            canRename={!workspaceReadOnly}
                            canDelete={!workspaceReadOnly}
                            canClear={!workspaceReadOnly}
                            triggerClassName="h-6 w-6 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100"
                            dropdownAlign="end"
                            dropdownSide="bottom"
                            listenForMoveEvent={false}
                        />
                    </div>
                </div>
            </SidebarMenuSubItem>
        );
    }

    return (
        <SidebarMenuSubItem>
            <Collapsible open={open} onOpenChange={setOpen}>
                <div className="group/item relative flex items-center gap-1">
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

                    <SidebarMenuSubButton
                        asChild
                        isActive={isActive}
                        className="pr-8 group-data-[collapsible=icon]:pr-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                    >
                        <Link href={item.href} prefetch>
                            <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                                <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                            </span>
                            <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                        </Link>
                    </SidebarMenuSubButton>
                    <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                        <NoteHeaderActions
                            noteId={item.id}
                            title={item.title}
                            currentLocation={parentPath}
                            currentParentId={parentId}
                            moveParentOptions={moveParentOptions}
                            canMove={!workspaceReadOnly}
                            canRename={!workspaceReadOnly}
                            canDelete={!workspaceReadOnly}
                            canClear={!workspaceReadOnly}
                            triggerClassName="h-6 w-6 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100"
                            dropdownAlign="end"
                            dropdownSide="bottom"
                            listenForMoveEvent={false}
                        />
                    </div>
                </div>

                <CollapsibleContent>
                    <NoteSubTree
                        items={item.children}
                        allOptions={allOptions}
                        parentPath={currentPath}
                        parentId={item.id}
                        workspaceReadOnly={workspaceReadOnly}
                    />
                </CollapsibleContent>
            </Collapsible>
        </SidebarMenuSubItem>
    );
}

export function NavNotesTree() {
    const { notesTree, currentWorkspace } = usePage().props as {
        notesTree?: SidebarNoteTreeItem[];
        currentWorkspace?: {
            is_migrated_source?: boolean;
        } | null;
    };
    const { t } = useI18n();
    const items = useMemo(
        () => (notesTree ?? []) as SidebarNoteTreeItem[],
        [notesTree],
    );
    const workspaceReadOnly = currentWorkspace?.is_migrated_source === true;
    const [createOpen, setCreateOpen] = useState(false);

    const parentOptions = useMemo(() => {
        const flattened: CreateNoteParentOption[] = [];

        const visit = (
            node: SidebarNoteTreeItem,
            ancestors: string[],
        ) => {
            const path = [...ancestors, node.title].join(' / ');
            flattened.push({
                id: node.id,
                title: node.title,
                path,
            });

            node.children.forEach((child) =>
                visit(child, [...ancestors, node.title]),
            );
        };

        items.forEach((item) => visit(item, []));

        return flattened;
    }, [items]);

    const openDialog = useCallback(() => {
        if (workspaceReadOnly) {
            return;
        }

        setCreateOpen(true);
    }, [workspaceReadOnly]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (workspaceReadOnly) {
                return;
            }

            if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'n') {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            openDialog();
        };

        document.addEventListener('keydown', onKeyDown, { capture: true });
        return () => {
            document.removeEventListener('keydown', onKeyDown, { capture: true });
        };
        // Intentionally global shortcut registration.
         
    }, [openDialog, workspaceReadOnly]);

    useEffect(() => {
        const openHandler = () => {
            openDialog();
        };

        window.addEventListener('open-create-note-dialog', openHandler);

        return () => {
            window.removeEventListener('open-create-note-dialog', openHandler);
        };
        // Intentionally global event registration.
         
    }, [openDialog, workspaceReadOnly]);

    return (
        <>
        {!workspaceReadOnly ? (
            <SidebarGroup className="hidden px-2 py-1 group-data-[collapsible=icon]:block">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            onClick={openDialog}
                            tooltip={t('notes_create.new_note', 'New note')}
                            className="justify-center"
                        >
                            <Plus className="h-4 w-4" />
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarGroup>
        ) : null}
        <SidebarGroup className="px-2 py-0 group-data-[collapsible=icon]:hidden">
            <div className="mb-1 flex items-center justify-between px-2">
                <SidebarGroupLabel className="px-0">
                    {t('notes_create.heading', 'Notes')}
                </SidebarGroupLabel>
                {!workspaceReadOnly ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        aria-label={t('notes_create.new_note', 'New note')}
                        onClick={openDialog}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                ) : null}
            </div>
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
                    <RootNoteItem
                        key={item.id}
                        item={item}
                        allOptions={parentOptions}
                        parentPath={null}
                        parentId={null}
                        workspaceReadOnly={workspaceReadOnly}
                    />
                ))}
            </SidebarMenu>
            <CreateNoteDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                parentOptions={parentOptions}
            />
        </SidebarGroup>
        </>
    );
}
