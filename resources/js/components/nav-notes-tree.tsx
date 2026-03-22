import { Link, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronRight, FileText, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getColorBgClass, getColorTextClass } from '@/components/color-swatch-picker';
import { CreateNoteDialog } from '@/components/create-note-dialog';
import type { CreateNoteParentOption } from '@/components/create-note-dialog';
import { getWorkspaceIconComponent } from '@/components/icon-picker';
import { NoteHeaderActions } from '@/components/note-header-actions';
import { Button } from '@/components/ui/button';
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
import { loadNoteOptions } from '@/lib/note-options';
import { cn } from '@/lib/utils';
import type { SidebarNoteTreeItem } from '@/types';

type LazySidebarTreeItem = SidebarNoteTreeItem & {
    has_children: boolean;
};

type SidebarChildrenCacheEntry = {
    expiresAt: number;
    children: LazySidebarTreeItem[];
};

type SidebarPathCacheEntry = {
    expiresAt: number;
    path: string[];
};

type SharedPageProps = {
    notesTree?: SidebarNoteTreeItem[];
    noteId?: string;
    currentWorkspace?: {
        slug?: string | null;
        is_migrated_source?: boolean;
    } | null;
};

const ROOT_PARENT_KEY = '__root__';
const SIDEBAR_BRANCH_CACHE_TTL_MS = 2 * 60 * 1000;
const sidebarChildrenCache = new Map<string, SidebarChildrenCacheEntry>();
const sidebarPathCache = new Map<string, SidebarPathCacheEntry>();

function toLazyNode(item: SidebarNoteTreeItem): LazySidebarTreeItem {
    return {
        ...item,
        has_children: Boolean(item.has_children) || item.children.length > 0,
        children: item.children.map(toLazyNode),
    };
}

function replaceChildren(
    nodes: LazySidebarTreeItem[],
    parentId: string,
    children: LazySidebarTreeItem[],
): LazySidebarTreeItem[] {
    return nodes.map((node) => {
        if (node.id === parentId) {
            return {
                ...node,
                has_children: node.has_children || children.length > 0,
                children,
            };
        }

        if (node.children.length === 0) {
            return node;
        }

        return {
            ...node,
            children: replaceChildren(node.children, parentId, children),
        };
    });
}

function cloneLazyNodes(nodes: LazySidebarTreeItem[]): LazySidebarTreeItem[] {
    return nodes.map((node) => ({
        ...node,
        children: cloneLazyNodes(node.children),
    }));
}

function mergeRootNodes(
    current: LazySidebarTreeItem[],
    incoming: LazySidebarTreeItem[],
): LazySidebarTreeItem[] {
    const existingById = new Map(current.map((node) => [node.id, node]));

    return incoming.map((node) => {
        const existing = existingById.get(node.id);

        if (!existing) {
            return node;
        }

        return {
            ...node,
            has_children: node.has_children || existing.children.length > 0,
            children: existing.children,
        };
    });
}

function hasActiveInBranch(
    item: LazySidebarTreeItem,
    isCurrentUrl: ReturnType<typeof useCurrentUrl>['isCurrentUrl'],
): boolean {
    if (isCurrentUrl(item.href)) {
        return true;
    }

    return item.children.some((child) => hasActiveInBranch(child, isCurrentUrl));
}

type TreeNodeProps = {
    item: LazySidebarTreeItem;
    allOptions: CreateNoteParentOption[];
    workspaceSlug: string;
    workspaceReadOnly: boolean;
    parentPath: string | null;
    parentId: string | null;
    expandedIds: Set<string>;
    loadingParentIds: Set<string>;
    onToggleNode: (id: string, shouldOpen: boolean, hasChildren: boolean) => void;
};

function TreeNode({
    item,
    allOptions,
    workspaceSlug,
    workspaceReadOnly,
    parentPath,
    parentId,
    expandedIds,
    loadingParentIds,
    onToggleNode,
}: TreeNodeProps) {
    const { isCurrentUrl } = useCurrentUrl();
    const isActive = isCurrentUrl(item.href);
    const hasChildren = item.has_children;
    const hasLoadedChildren = item.children.length > 0;
    const isExpanded = expandedIds.has(item.id) || (isActive && hasChildren) || item.children.some((child) => hasActiveInBranch(child, isCurrentUrl));
    const isLoading = loadingParentIds.has(item.id);
    const NoteIcon = item.icon ? getWorkspaceIconComponent(item.icon) : FileText;
    const iconColorClass = getColorTextClass(item.icon_color ?? null);
    const iconBgClass = getColorBgClass(item.icon_bg ?? null);
    const currentPath = parentPath ? `${parentPath} / ${item.title}` : item.title;

    const Wrapper = parentPath === null ? SidebarMenuItem : SidebarMenuSubItem;
    const ButtonComponent = parentPath === null ? SidebarMenuButton : SidebarMenuSubButton;
    const ChildrenWrapper = parentPath === null ? SidebarMenuSub : SidebarMenuSub;

    return (
        <Wrapper>
            <div className="group/item relative flex items-center gap-0">
                {hasChildren ? (
                    <button
                        type="button"
                        className="text-sidebar-foreground/70 hover:text-sidebar-foreground flex h-5 w-4 shrink-0 items-center justify-center"
                        aria-label={`Toggle ${item.title}`}
                        onClick={() => onToggleNode(item.id, !isExpanded, hasChildren)}
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-3 w-3" />
                        ) : (
                            <ChevronRight className="h-3 w-3" />
                        )}
                    </button>
                ) : (
                    <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none flex h-5 w-4 shrink-0 items-center justify-center opacity-0"
                    >
                        <ChevronRight className="h-3 w-3" />
                    </button>
                )}

                <ButtonComponent
                    asChild
                    size="sm"
                    isActive={isActive}
                    className="pl-0.5 pr-8 group-data-[collapsible=icon]:pr-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                >
                    <Link href={item.href} prefetch>
                        <span className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm', iconBgClass)}>
                            <Icon iconNode={NoteIcon} className={cn('h-4 w-4', iconColorClass)} />
                        </span>
                        <span className="group-data-[collapsible=icon]:hidden">{item.title}</span>
                    </Link>
                </ButtonComponent>
                <div className="absolute right-1 top-1/2 z-10 -translate-y-1/2">
                    <NoteHeaderActions
                        noteId={item.id}
                        workspaceSlug={workspaceSlug}
                        title={item.title}
                        currentLocation={parentPath}
                        currentParentId={parentId}
                        canMove={!workspaceReadOnly}
                        canRename={!workspaceReadOnly}
                        canDelete={!workspaceReadOnly}
                        canClear={!workspaceReadOnly}
                        canCreateChild={!workspaceReadOnly}
                        createChildParentOptions={allOptions}
                        triggerClassName="h-6 w-6 opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-within/item:opacity-100"
                        dropdownAlign="end"
                        dropdownSide="bottom"
                        listenForMoveEvent={false}
                    />
                </div>
            </div>

            {hasChildren && isExpanded ? (
                <ChildrenWrapper>
                    {hasLoadedChildren ? (
                        item.children.map((child) => (
                            <TreeNode
                                key={child.id}
                                item={child}
                                allOptions={allOptions}
                                workspaceSlug={workspaceSlug}
                                workspaceReadOnly={workspaceReadOnly}
                                parentPath={currentPath}
                                parentId={item.id}
                                expandedIds={expandedIds}
                                loadingParentIds={loadingParentIds}
                                onToggleNode={onToggleNode}
                            />
                        ))
                    ) : isLoading ? (
                        <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                                size="sm"
                                className="text-sidebar-foreground/60"
                            >
                                <span>Loading…</span>
                            </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                    ) : null}
                </ChildrenWrapper>
            ) : null}
        </Wrapper>
    );
}

export function NavNotesTree() {
    const { notesTree, currentWorkspace, noteId } = usePage().props as SharedPageProps;
    const { t } = useI18n();
    const workspaceSlug = currentWorkspace?.slug?.trim() ?? '';
    const workspaceReadOnly = currentWorkspace?.is_migrated_source === true;

    const initialItems = useMemo(
        () => ((notesTree ?? []) as SidebarNoteTreeItem[]).map(toLazyNode),
        [notesTree],
    );

    const [items, setItems] = useState<LazySidebarTreeItem[]>(initialItems);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [loadingParentIds, setLoadingParentIds] = useState<Set<string>>(new Set());
    const [loadedParentIds, setLoadedParentIds] = useState<Set<string>>(new Set([ROOT_PARENT_KEY]));
    const loadedParentIdsRef = useRef<Set<string>>(new Set([ROOT_PARENT_KEY]));
    const pendingChildrenRequests = useRef<Map<string, Promise<void>>>(new Map());
    const previousWorkspaceSlugRef = useRef(workspaceSlug);

    const [createOpen, setCreateOpen] = useState(false);
    const [parentOptions, setParentOptions] = useState<CreateNoteParentOption[]>([]);

    useEffect(() => {
        loadedParentIdsRef.current = loadedParentIds;
    }, [loadedParentIds]);

    useEffect(() => {
        const workspaceChanged = previousWorkspaceSlugRef.current !== workspaceSlug;
        previousWorkspaceSlugRef.current = workspaceSlug;

        if (workspaceChanged) {
            const resetLoaded = new Set<string>([ROOT_PARENT_KEY]);
            setItems(initialItems);
            setExpandedIds(new Set());
            setLoadingParentIds(new Set());
            setLoadedParentIds(resetLoaded);
            loadedParentIdsRef.current = resetLoaded;
            pendingChildrenRequests.current.clear();

            return;
        }

        setItems((current) => mergeRootNodes(current, initialItems));
    }, [initialItems, workspaceSlug]);

    useEffect(() => {
        if (workspaceSlug === '') {
            setParentOptions([]);
            return;
        }

        let cancelled = false;
        void loadNoteOptions({
            workspaceSlug,
            scope: 'move_parent',
            limit: 2000,
        }).then((options) => {
            if (cancelled) {
                return;
            }

            setParentOptions((options as CreateNoteParentOption[]).slice());
        });

        return () => {
            cancelled = true;
        };
    }, [workspaceSlug]);

    const fetchChildren = useCallback(async (parentId: string): Promise<void> => {
        if (workspaceSlug === '') {
            return;
        }

        if (loadedParentIdsRef.current.has(parentId)) {
            return;
        }

        const now = Date.now();
        const cacheKey = `${workspaceSlug}:${parentId}`;
        const cached = sidebarChildrenCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            const cachedChildren = cloneLazyNodes(cached.children);
            setItems((current) => replaceChildren(current, parentId, cachedChildren));
            setLoadedParentIds((current) => {
                const next = new Set(current);
                next.add(parentId);
                loadedParentIdsRef.current = next;

                return next;
            });

            return;
        }

        if (cached && cached.expiresAt <= now) {
            sidebarChildrenCache.delete(cacheKey);
        }

        if (pendingChildrenRequests.current.has(parentId)) {
            return pendingChildrenRequests.current.get(parentId);
        }

        const promise = (async () => {
            setLoadingParentIds((current) => {
                const next = new Set(current);
                next.add(parentId);

                return next;
            });

            try {
                const query = new URLSearchParams();
                query.set('parent_id', parentId);
                const response = await fetch(`/notes/sidebar-tree?${query.toString()}`, {
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                });

                if (!response.ok) {
                    return;
                }

                const payload = (await response.json()) as {
                    nodes?: SidebarNoteTreeItem[];
                };
                const children = Array.isArray(payload.nodes)
                    ? payload.nodes.map(toLazyNode)
                    : [];

                sidebarChildrenCache.set(cacheKey, {
                    expiresAt: Date.now() + SIDEBAR_BRANCH_CACHE_TTL_MS,
                    children: cloneLazyNodes(children),
                });
                setItems((current) => replaceChildren(current, parentId, children));
                setLoadedParentIds((current) => {
                    const next = new Set(current);
                    next.add(parentId);
                    loadedParentIdsRef.current = next;

                    return next;
                });
            } finally {
                setLoadingParentIds((current) => {
                    const next = new Set(current);
                    next.delete(parentId);

                    return next;
                });
                pendingChildrenRequests.current.delete(parentId);
            }
        })();

        pendingChildrenRequests.current.set(parentId, promise);

        return promise;
    }, [workspaceSlug]);

    useEffect(() => {
        if (!noteId || workspaceSlug === '') {
            return;
        }

        let cancelled = false;

        void (async () => {
            const cacheKey = `${workspaceSlug}:${noteId}`;
            const now = Date.now();
            const cached = sidebarPathCache.get(cacheKey);
            let path: string[] = [];

            if (cached && cached.expiresAt > now) {
                path = cached.path.slice();
            } else {
                if (cached && cached.expiresAt <= now) {
                    sidebarPathCache.delete(cacheKey);
                }

                const query = new URLSearchParams();
                query.set('note_id', noteId);
                const response = await fetch(`/notes/sidebar-tree-path?${query.toString()}`, {
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                });

                if (!response.ok || cancelled) {
                    return;
                }

                const payload = (await response.json()) as { path?: string[] };
                path = Array.isArray(payload.path) ? payload.path : [];
                sidebarPathCache.set(cacheKey, {
                    expiresAt: Date.now() + SIDEBAR_BRANCH_CACHE_TTL_MS,
                    path: path.slice(),
                });
            }

            if (path.length <= 1) {
                return;
            }

            for (const id of path.slice(0, -1)) {
                if (cancelled) {
                    return;
                }

                setExpandedIds((current) => {
                    const next = new Set(current);
                    next.add(id);

                    return next;
                });
                await fetchChildren(id);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [fetchChildren, noteId, workspaceSlug]);

    const onToggleNode = useCallback((id: string, shouldOpen: boolean, hasChildren: boolean) => {
        setExpandedIds((current) => {
            const next = new Set(current);
            if (shouldOpen) {
                next.add(id);
            } else {
                next.delete(id);
            }

            return next;
        });

        if (shouldOpen && hasChildren) {
            void fetchChildren(id);
        }
    }, [fetchChildren]);

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
    }, [openDialog, workspaceReadOnly]);

    useEffect(() => {
        const openHandler = () => {
            openDialog();
        };

        window.addEventListener('open-create-note-dialog', openHandler);

        return () => {
            window.removeEventListener('open-create-note-dialog', openHandler);
        };
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
                    {items.length === 0 ? (
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                isActive={false}
                                className="text-sidebar-foreground/60"
                            >
                                <span>No notes yet</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ) : (
                        items.map((item) => (
                            <TreeNode
                                key={item.id}
                                item={item}
                                allOptions={parentOptions}
                                workspaceSlug={workspaceSlug}
                                workspaceReadOnly={workspaceReadOnly}
                                parentPath={null}
                                parentId={null}
                                expandedIds={expandedIds}
                                loadingParentIds={loadingParentIds}
                                onToggleNode={onToggleNode}
                            />
                        ))
                    )}
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
