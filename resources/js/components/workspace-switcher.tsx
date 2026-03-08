import { router, useForm, usePage } from '@inertiajs/react';
import {
    Check,
    ChevronsUpDown,
    Cog,
    Loader2,
    Mail,
    Settings,
    ShieldCheck,
    UserPlus,
    Users,
    Plus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    DEFAULT_WORKSPACE_ICON,
    getWorkspaceIconComponent,
    IconPicker,
} from '@/components/icon-picker';
import InputError from '@/components/input-error';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';

type WorkspaceItem = {
    id: string;
    name: string;
    color: string;
    icon: string;
    role: string;
};

type WorkspaceSettingsData = {
    workspace: {
        id: string;
        name: string;
        color: string;
        icon: string;
        owner_id: number;
    };
    members: Array<{
        id: number;
        name: string;
        email: string;
        role: 'owner' | 'member' | string;
    }>;
};

const WORKSPACE_COLOR_OPTIONS = [
    'black',
    'slate',
    'zinc',
    'stone',
    'red',
    'orange',
    'amber',
    'yellow',
    'lime',
    'green',
    'emerald',
    'teal',
    'cyan',
    'sky',
    'blue',
    'indigo',
    'violet',
    'purple',
    'fuchsia',
    'pink',
    'rose',
] as const;

const WORKSPACE_COLOR_CLASS: Record<(typeof WORKSPACE_COLOR_OPTIONS)[number], string> = {
    black: 'bg-black',
    slate: 'bg-slate-600',
    zinc: 'bg-zinc-600',
    stone: 'bg-stone-600',
    red: 'bg-red-600',
    orange: 'bg-orange-600',
    amber: 'bg-amber-600',
    yellow: 'bg-yellow-500',
    lime: 'bg-lime-600',
    green: 'bg-green-600',
    emerald: 'bg-emerald-600',
    teal: 'bg-teal-600',
    cyan: 'bg-cyan-600',
    sky: 'bg-sky-600',
    blue: 'bg-blue-600',
    indigo: 'bg-indigo-600',
    violet: 'bg-violet-600',
    purple: 'bg-purple-600',
    fuchsia: 'bg-fuchsia-600',
    pink: 'bg-pink-600',
    rose: 'bg-rose-600',
};

export function WorkspaceSwitcher() {
    const { workspaces = [], currentWorkspace = null } = usePage().props as {
        workspaces?: WorkspaceItem[];
        currentWorkspace?: WorkspaceItem | null;
    };

    const isMobile = useIsMobile();
    const workspaceName = currentWorkspace?.name ?? '';
    const [createOpen, setCreateOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'general' | 'members'>('general');
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsData, setSettingsData] = useState<WorkspaceSettingsData | null>(null);
    const createForm = useForm({
        name: '',
        color: 'slate',
        icon: DEFAULT_WORKSPACE_ICON,
    });
    const nameForm = useForm({
        name: workspaceName,
        color: currentWorkspace?.color ?? 'slate',
        icon: currentWorkspace?.icon ?? DEFAULT_WORKSPACE_ICON,
    });
    const addMemberForm = useForm({
        email: '',
    });
    const removeMemberForm = useForm({
        user_id: 0,
    });
    const roleForm = useForm({
        user_id: 0,
        role: 'member',
    });

    const switchWorkspace = (workspaceId: string) => {
        if (!currentWorkspace) {
            return;
        }

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

    const loadSettings = async () => {
        setSettingsLoading(true);

        try {
            const response = await fetch('/workspaces/settings/data', {
                method: 'GET',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to load workspace settings');
            }

            const payload = (await response.json()) as WorkspaceSettingsData;
            setSettingsData(payload);
            nameForm.setData('name', payload.workspace.name);
            nameForm.setData('color', payload.workspace.color ?? 'slate');
            nameForm.setData('icon', payload.workspace.icon ?? DEFAULT_WORKSPACE_ICON);
        } catch {
            setSettingsData(null);
        } finally {
            setSettingsLoading(false);
        }
    };

    useEffect(() => {
        if (!settingsOpen) {
            return;
        }

        void loadSettings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settingsOpen]);

    if (!currentWorkspace) {
        return null;
    }

    const CurrentWorkspaceIcon = getWorkspaceIconComponent(currentWorkspace.icon);

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
                                    className={`flex aspect-square size-8 items-center justify-center rounded-md text-white ${
                                        WORKSPACE_COLOR_CLASS[
                                            (currentWorkspace.color as keyof typeof WORKSPACE_COLOR_CLASS) ??
                                                'slate'
                                        ] ?? WORKSPACE_COLOR_CLASS.slate
                                    }`}
                                >
                                    <CurrentWorkspaceIcon className="size-5 text-white" />
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
                                    const WorkspaceIcon = getWorkspaceIconComponent(workspace.icon);

                                    return (
                                        <DropdownMenuItem
                                            key={workspace.id}
                                            onClick={() =>
                                                switchWorkspace(workspace.id)
                                            }
                                            className="cursor-pointer rounded-md px-2 py-2"
                                        >
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                                <div
                                                    className={`flex h-8 w-8 items-center justify-center rounded-md text-white ${
                                                        WORKSPACE_COLOR_CLASS[
                                                            (workspace.color as keyof typeof WORKSPACE_COLOR_CLASS) ??
                                                                'slate'
                                                        ] ?? WORKSPACE_COLOR_CLASS.slate
                                                    }`}
                                                >
                                                    <WorkspaceIcon className="size-4 text-white" />
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
                                                {workspace.id ===
                                                    currentWorkspace.id && (
                                                    <Check className="h-4 w-4" />
                                                )}
                                            </div>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </div>
                            <DropdownMenuSeparator />
                            <div className="p-1">
                                <DropdownMenuItem
                                    onClick={() => {
                                        setSettingsTab('general');
                                        setSettingsOpen(true);
                                    }}
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
                                    createForm.setData('color', 'slate');
                                    setCreateOpen(false);
                                },
                            });
                        }}
                    >
                        <div className="grid gap-3">
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

            <Dialog
                open={settingsOpen}
                onOpenChange={(open) => {
                    setSettingsOpen(open);
                    if (!open) {
                        setSettingsTab('general');
                    }
                }}
            >
                <DialogContent className="w-[min(92vw,720px)] max-w-[92vw] sm:max-w-[min(92vw,720px)] p-0 gap-0">
                    <DialogHeader className="border-b border-border/70 px-6 py-4">
                        <DialogTitle>Workspace settings</DialogTitle>
                        <DialogDescription>
                            Manage general settings and members for this workspace.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid max-h-[70vh] min-h-[24rem] min-w-0 grid-cols-[250px_minmax(0,1fr)]">
                        <aside className="border-r bg-muted/30 px-3 pb-3">
                            <div className="space-y-1 pt-3">
                                <button
                                    type="button"
                                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${
                                        settingsTab === 'general'
                                            ? 'bg-background font-medium text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                                    }`}
                                    onClick={() => setSettingsTab('general')}
                                >
                                    <Settings className="h-4 w-4" />
                                    General
                                </button>
                                <button
                                    type="button"
                                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${
                                        settingsTab === 'members'
                                            ? 'bg-background font-medium text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:bg-background/60 hover:text-foreground'
                                    }`}
                                    onClick={() => setSettingsTab('members')}
                                >
                                    <Users className="h-4 w-4" />
                                    Members
                                </button>
                            </div>
                        </aside>

                        <section className="min-h-0 overflow-y-auto px-6 pt-4 pb-6">
                            {settingsLoading ? (
                                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Loading workspace settings...
                                </div>
                            ) : settingsData === null ? (
                                <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                                    Failed to load workspace settings.
                                </div>
                            ) : settingsTab === 'general' ? (
                                <form
                                    className="max-w-xl space-y-5"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        nameForm.patch('/workspaces/settings', {
                                            preserveScroll: true,
                                            onSuccess: () => {
                                                void loadSettings();
                                            },
                                        });
                                    }}
                                >
                                    <div className="space-y-3">
                                        <Label htmlFor="workspace-settings-name">
                                            Workspace name
                                        </Label>
                                        <Input
                                            id="workspace-settings-name"
                                            value={nameForm.data.name}
                                            onChange={(event) =>
                                                nameForm.setData(
                                                    'name',
                                                    event.target.value,
                                                )
                                            }
                                        />
                                        <InputError
                                            message={nameForm.errors.name}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Workspace color</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {WORKSPACE_COLOR_OPTIONS.map((color) => (
                                                <button
                                                    key={color}
                                                    type="button"
                                                    className={`relative h-7 w-7 rounded-full border border-border/70 p-[2px] transition ${
                                                        WORKSPACE_COLOR_CLASS[
                                                            color
                                                        ]
                                                    } after:absolute after:inset-[2px] after:rounded-full after:content-[''] ${
                                                        nameForm.data.color ===
                                                        color
                                                            ? 'border-foreground'
                                                            : 'hover:border-foreground/40'
                                                    } ${
                                                        nameForm.data.color ===
                                                        color
                                                            ? 'after:border after:border-white after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]'
                                                            : ''
                                                    }`}
                                                    aria-label={`Set workspace color to ${color}`}
                                                    onClick={() =>
                                                        nameForm.setData(
                                                            'color',
                                                            color,
                                                        )
                                                    }
                                                />
                                            ))}
                                        </div>
                                        <InputError
                                            message={nameForm.errors.color}
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <Label>Workspace icon</Label>
                                        <IconPicker
                                            value={nameForm.data.icon}
                                            onValueChange={(icon) =>
                                                nameForm.setData('icon', icon)
                                            }
                                        />
                                        <InputError
                                            message={nameForm.errors.icon}
                                        />
                                    </div>

                                    <div className="flex justify-end">
                                        <Button
                                            type="submit"
                                            disabled={nameForm.processing}
                                        >
                                            Save
                                        </Button>
                                    </div>
                                </form>
                            ) : (
                                <div className="space-y-6">
                                    <form
                                        className="flex flex-col gap-3 sm:flex-row"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            addMemberForm.post(
                                                '/workspaces/settings/members',
                                                {
                                                    preserveScroll: true,
                                                    onSuccess: () => {
                                                        addMemberForm.reset(
                                                            'email',
                                                        );
                                                        void loadSettings();
                                                    },
                                                },
                                            );
                                        }}
                                    >
                                        <div className="flex-1 space-y-3">
                                            <Label htmlFor="workspace-member-email">
                                                Invite by email
                                            </Label>
                                            <div className="relative">
                                                <Mail className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                                                <Input
                                                    id="workspace-member-email"
                                                    type="email"
                                                    placeholder="user@example.com"
                                                    className="pl-9"
                                                    value={
                                                        addMemberForm.data.email
                                                    }
                                                    onChange={(event) =>
                                                        addMemberForm.setData(
                                                            'email',
                                                            event.target.value,
                                                        )
                                                    }
                                                />
                                            </div>
                                            <InputError
                                                message={
                                                    addMemberForm.errors.email
                                                }
                                            />
                                        </div>
                                        <div className="self-end">
                                            <Button
                                                type="submit"
                                                disabled={
                                                    addMemberForm.processing
                                                }
                                            >
                                                <UserPlus className="mr-2 h-4 w-4" />
                                                Add member
                                            </Button>
                                        </div>
                                    </form>

                                    <div className="space-y-2 rounded-lg border">
                                        {settingsData.members.map((member) => (
                                            <div
                                                key={member.id}
                                                className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                                            >
                                                <div className="min-w-0">
                                                    <div className="truncate font-medium">
                                                        {member.name}
                                                    </div>
                                                    <div className="truncate text-sm text-muted-foreground">
                                                        {member.email}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {member.id ===
                                                    settingsData.workspace
                                                        .owner_id ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                                                            <ShieldCheck className="h-3.5 w-3.5" />
                                                            Owner
                                                        </span>
                                                    ) : (
                                                        <select
                                                            className="h-8 rounded-md border px-2 text-sm"
                                                            value={
                                                                member.role ===
                                                                'owner'
                                                                    ? 'owner'
                                                                    : 'member'
                                                            }
                                                            onChange={(
                                                                event,
                                                            ) => {
                                                                roleForm.setData(
                                                                    {
                                                                        user_id:
                                                                            member.id,
                                                                        role: event
                                                                            .target
                                                                            .value,
                                                                    },
                                                                );

                                                                roleForm.patch(
                                                                    '/workspaces/settings/members/role',
                                                                    {
                                                                        preserveScroll:
                                                                            true,
                                                                        onSuccess:
                                                                            () => {
                                                                                void loadSettings();
                                                                            },
                                                                    },
                                                                );
                                                            }}
                                                            disabled={
                                                                roleForm.processing
                                                            }
                                                        >
                                                            <option value="member">
                                                                Member
                                                            </option>
                                                            <option value="owner">
                                                                Owner
                                                            </option>
                                                        </select>
                                                    )}

                                                    {member.id !==
                                                        settingsData.workspace
                                                            .owner_id && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="sm"
                                                            disabled={
                                                                removeMemberForm.processing
                                                            }
                                                            onClick={() => {
                                                                removeMemberForm.setData(
                                                                    'user_id',
                                                                    member.id,
                                                                );
                                                                removeMemberForm.delete(
                                                                    '/workspaces/settings/members',
                                                                    {
                                                                        preserveScroll:
                                                                            true,
                                                                        onSuccess:
                                                                            () => {
                                                                                void loadSettings();
                                                                            },
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            Remove
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <InputError message={roleForm.errors.role} />
                                    <InputError
                                        message={removeMemberForm.errors.user_id}
                                    />
                                </div>
                            )}
                        </section>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
