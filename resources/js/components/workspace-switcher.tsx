import { router, useForm, usePage } from '@inertiajs/react';
import {
    Check,
    ChevronsUpDown,
    Cog,
    Plus,
    Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

type WorkspaceItem = {
    id: string;
    name: string;
    role: string;
};

export function WorkspaceSwitcher() {
    const { workspaces = [], currentWorkspace = null } = usePage().props as {
        workspaces?: WorkspaceItem[];
        currentWorkspace?: WorkspaceItem | null;
    };

    const { state } = useSidebar();
    const isMobile = useIsMobile();
    const [createOpen, setCreateOpen] = useState(false);
    const createForm = useForm({
        name: '',
    });

    if (!currentWorkspace) {
        return null;
    }

    const switchWorkspace = (workspaceId: string) => {
        if (workspaceId === currentWorkspace.id) {
            return;
        }

        router.post(
            '/workspaces/switch',
            { workspace_id: workspaceId },
            {
                preserveState: false,
                preserveScroll: false,
            },
        );
    };

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                size="lg"
                                className="h-12 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/35 px-2 text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent"
                            >
                                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                                    <AppLogoIcon className="size-5 fill-current text-white dark:text-black" />
                                </div>
                                <div className="ml-1 grid flex-1 text-left text-sm leading-tight">
                                    <span className="mb-0.5 truncate leading-tight font-semibold">
                                        {currentWorkspace.name}
                                    </span>
                                    <span className="truncate text-xs text-muted-foreground capitalize">
                                        {currentWorkspace.role}
                                    </span>
                                </div>
                                <ChevronsUpDown className="ml-auto size-4" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent
                            className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg p-0"
                            align="start"
                            side={isMobile ? 'bottom' : 'right'}
                        >
                            <DropdownMenuLabel className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                                <span className="font-medium">Workspaces</span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setCreateOpen(true);
                                    }}
                                >
                                    <Plus className="h-4 w-4" />
                                    <span className="sr-only">
                                        Create workspace
                                    </span>
                                </Button>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <div className="p-1">
                                {workspaces.map((workspace, index) => (
                                    <DropdownMenuItem
                                        key={workspace.id}
                                        onClick={() =>
                                            switchWorkspace(workspace.id)
                                        }
                                        className="cursor-pointer rounded-md px-2 py-2"
                                    >
                                        <div className="flex min-w-0 flex-1 items-center gap-2">
                                            <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                                                <Sparkles className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate font-medium">
                                                    {workspace.name}
                                                </div>
                                                <div className="text-xs text-muted-foreground capitalize">
                                                    {workspace.role}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="ml-2 flex items-center gap-2 text-muted-foreground">
                                            <span className="text-xs">
                                                ⌘{index + 1}
                                            </span>
                                            {workspace.id ===
                                                currentWorkspace.id && (
                                                <Check className="h-4 w-4" />
                                            )}
                                        </div>
                                    </DropdownMenuItem>
                                ))}
                            </div>
                            <DropdownMenuSeparator />
                            <div className="p-1">
                                <DropdownMenuItem
                                    onClick={() =>
                                        router.get('/workspaces/settings')
                                    }
                                    className="cursor-pointer rounded-md px-2 py-2"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                                        <Cog className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium">
                                            Workspace settings
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                            {currentWorkspace.name}
                                        </div>
                                    </div>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setCreateOpen(true)}
                                    className="cursor-pointer rounded-md px-2 py-2"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                                        <Plus className="h-4 w-4" />
                                    </div>
                                    <div className="font-medium">
                                        Add workspace
                                    </div>
                                </DropdownMenuItem>
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create workspace</DialogTitle>
                        <DialogDescription>
                            Create a new workspace and switch to it.
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createForm.post('/workspaces', {
                                onSuccess: () => {
                                    createForm.reset();
                                    setCreateOpen(false);
                                },
                            });
                        }}
                    >
                        <div className="grid gap-2">
                            <Label htmlFor="workspace-name">
                                Workspace name
                            </Label>
                            <Input
                                id="workspace-name"
                                value={createForm.data.name}
                                onChange={(event) =>
                                    createForm.setData(
                                        'name',
                                        event.target.value,
                                    )
                                }
                                placeholder="My workspace"
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreateOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={createForm.processing}
                            >
                                Create
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
