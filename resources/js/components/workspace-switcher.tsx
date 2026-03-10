import { router, useForm, usePage } from '@inertiajs/react';
import { Check, ChevronsUpDown, Cog, Plus } from 'lucide-react';
import { useState } from 'react';
import {
    getColorThemeBgClass,
} from '@/components/color-swatch-picker';
import {
    DEFAULT_WORKSPACE_ICON,
    getWorkspaceIconComponent,
} from '@/components/icon-picker';
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
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useI18n } from '@/lib/i18n';

type WorkspaceItem = {
    id: string;
    name: string;
    color: string;
    icon: string;
    role: string;
};

export function WorkspaceSwitcher() {
    const { workspaces = [], currentWorkspace = null } = usePage().props as {
        workspaces?: WorkspaceItem[];
        currentWorkspace?: WorkspaceItem | null;
    };

    const { t } = useI18n();
    const isMobile = useIsMobile();
    const [createOpen, setCreateOpen] = useState(false);
    const createForm = useForm({
        name: '',
        color: 'slate',
        icon: DEFAULT_WORKSPACE_ICON,
    });

    const switchWorkspace = (workspaceId: string) => {
        if (!currentWorkspace || workspaceId === currentWorkspace.id) {
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

    if (!currentWorkspace) {
        return null;
    }

    const workspaceIconTextClass = (color: string | null | undefined) =>
        color === 'black' ? 'text-white dark:text-zinc-900' : 'text-white';

    return (
        <>
            <SidebarMenu>
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                                size="lg"
                                className="h-12 rounded-lg px-2 text-sidebar-foreground hover:bg-sidebar-accent/60 data-[state=open]:bg-sidebar-accent"
                                >
                                    <div
                                        className={`flex aspect-square size-8 items-center justify-center rounded-md ${getColorThemeBgClass(
                                            currentWorkspace.color,
                                        )}`}
                                >
                                    <Icon
                                        iconNode={getWorkspaceIconComponent(currentWorkspace.icon)}
                                        className={`size-5 ${workspaceIconTextClass(currentWorkspace.color)}`}
                                    />
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
                            <div className="p-1">
                                {workspaces.map((workspace) => {
                                    return (
                                        <DropdownMenuItem
                                            key={workspace.id}
                                            onClick={() => switchWorkspace(workspace.id)}
                                            className="cursor-pointer rounded-md px-2 py-2"
                                        >
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <div
                                                    className={`flex h-8 w-8 items-center justify-center rounded-md ${getColorThemeBgClass(
                                                        workspace.color,
                                                    )}`}
                                                >
                                                    <Icon
                                                        iconNode={getWorkspaceIconComponent(workspace.icon)}
                                                        className={`size-4 ${workspaceIconTextClass(workspace.color)}`}
                                                    />
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
                                                {workspace.id === currentWorkspace.id ? (
                                                    <Check className="h-4 w-4" />
                                                ) : null}
                                            </div>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </div>
                            <DropdownMenuSeparator />
                            <div className="p-1">
                                <DropdownMenuItem
                                    onClick={() => {
                                        router.get(`/settings/workspaces/${currentWorkspace.id}`);
                                    }}
                                    className="cursor-pointer rounded-md px-2 py-2"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground">
                                        <Cog className="h-4 w-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium">
                                            {t('workspace_switcher.workspace_settings', 'Workspace settings')}
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
                                        {t('workspace_switcher.add_workspace', 'Add workspace')}
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
                        <DialogTitle>{t('workspace_switcher.create_workspace_title', 'Create workspace')}</DialogTitle>
                        <DialogDescription>
                            {t('workspace_switcher.create_workspace_description', 'Create a new workspace and switch to it.')}
                        </DialogDescription>
                    </DialogHeader>

                    <form
                        className="space-y-4"
                        onSubmit={(event) => {
                            event.preventDefault();
                            createForm.post('/workspaces', {
                                onSuccess: () => {
                                    createForm.reset();
                                    createForm.setData('color', 'slate');
                                    setCreateOpen(false);
                                },
                            });
                        }}
                    >
                        <div className="grid gap-3">
                            <Label htmlFor="workspace-name">
                                {t('workspace_switcher.workspace_name', 'Workspace name')}
                            </Label>
                            <Input
                                id="workspace-name"
                                value={createForm.data.name}
                                onChange={(event) =>
                                    createForm.setData('name', event.target.value)
                                }
                                placeholder={t('workspace_switcher.workspace_name_placeholder', 'My workspace')}
                            />
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCreateOpen(false)}
                            >
                                {t('workspace_switcher.cancel', 'Cancel')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={createForm.processing}
                            >
                                {t('workspace_switcher.create', 'Create')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
