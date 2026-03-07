import { Head, useForm } from '@inertiajs/react';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type Member = {
    id: number;
    name: string;
    email: string;
    role: 'owner' | 'member' | string;
};

type Props = {
    workspace: {
        id: string;
        name: string;
        owner_id: number;
    };
    members: Member[];
    status?: string;
};

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Workspace settings',
        href: '/workspaces/settings',
    },
];

export default function WorkspaceSettings({ workspace, members, status }: Props) {
    const nameForm = useForm({
        name: workspace.name,
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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Workspace settings" />

            <div className="px-4 py-6">
                <div className="mx-auto max-w-3xl space-y-8">
                    <div className="space-y-4">
                        <Heading
                            variant="small"
                            title="Workspace"
                            description="Change workspace name"
                        />

                        <form
                            className="space-y-4"
                            onSubmit={(event) => {
                                event.preventDefault();
                                nameForm.patch('/workspaces/settings', {
                                    preserveScroll: true,
                                });
                            }}
                        >
                            <div className="grid gap-2">
                                <Label htmlFor="workspace-name">Name</Label>
                                <Input
                                    id="workspace-name"
                                    value={nameForm.data.name}
                                    onChange={(event) =>
                                        nameForm.setData('name', event.target.value)
                                    }
                                />
                                <InputError message={nameForm.errors.name} />
                            </div>

                            <Button type="submit" disabled={nameForm.processing}>
                                Save workspace
                            </Button>
                            {status === 'workspace-updated' && (
                                <p className="text-sm text-muted-foreground">Saved.</p>
                            )}
                        </form>
                    </div>

                    <div className="space-y-4">
                        <Heading
                            variant="small"
                            title="Members"
                            description="Add/remove members, edit roles and transfer ownership"
                        />

                        <form
                            className="flex flex-col gap-3 sm:flex-row"
                            onSubmit={(event) => {
                                event.preventDefault();
                                addMemberForm.post('/workspaces/settings/members', {
                                    preserveScroll: true,
                                    onSuccess: () => addMemberForm.reset('email'),
                                });
                            }}
                        >
                            <div className="flex-1">
                                <Input
                                    type="email"
                                    placeholder="user@example.com"
                                    value={addMemberForm.data.email}
                                    onChange={(event) =>
                                        addMemberForm.setData('email', event.target.value)
                                    }
                                />
                                <InputError message={addMemberForm.errors.email} />
                            </div>
                            <Button type="submit" disabled={addMemberForm.processing}>
                                Add member
                            </Button>
                        </form>

                        <div className="space-y-2 rounded-lg border">
                            {members.map((member) => (
                                <div
                                    key={member.id}
                                    className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate font-medium">{member.name}</div>
                                        <div className="truncate text-sm text-muted-foreground">
                                            {member.email}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {member.id === workspace.owner_id ? (
                                            <span className="text-xs font-medium text-muted-foreground">
                                                Owner
                                            </span>
                                        ) : (
                                            <select
                                                className="h-8 rounded-md border px-2 text-sm"
                                                value={member.role === 'owner' ? 'owner' : 'member'}
                                                onChange={(event) => {
                                                    roleForm.setData({
                                                        user_id: member.id,
                                                        role: event.target.value,
                                                    });

                                                    roleForm.patch('/workspaces/settings/members/role', {
                                                        preserveScroll: true,
                                                    });
                                                }}
                                                disabled={roleForm.processing}
                                            >
                                                <option value="member">Member</option>
                                                <option value="owner">Owner</option>
                                            </select>
                                        )}

                                        {member.id !== workspace.owner_id && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={removeMemberForm.processing}
                                                onClick={() => {
                                                    removeMemberForm.setData('user_id', member.id);
                                                    removeMemberForm.delete('/workspaces/settings/members', {
                                                        preserveScroll: true,
                                                    });
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
                        <InputError message={removeMemberForm.errors.user_id} />

                        {(status === 'owner-transferred' ||
                            status === 'member-role-updated' ||
                            status === 'member-added' ||
                            status === 'member-removed') && (
                            <p className="text-sm text-muted-foreground">Changes saved.</p>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
