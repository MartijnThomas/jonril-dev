import { Head, useForm } from '@inertiajs/react';
import { Settings2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { COLOR_SWATCH_OPTIONS, ColorSwatchPicker } from '@/components/color-swatch-picker';
import Heading from '@/components/heading';
import { DEFAULT_WORKSPACE_ICON, IconPicker } from '@/components/icon-picker';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AppLayout from '@/layouts/app-layout';
import { useI18n } from '@/lib/i18n';
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
        color: string;
        icon: string;
        owner_id: number;
    };
    members: Member[];
    status?: string;
};

export default function WorkspaceSettings({ workspace, members, status }: Props) {
    const { t } = useI18n();
    const [section, setSection] = useState<'general' | 'members'>('general');

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('workspace_settings.title', 'Workspace settings'),
                href: '/workspaces/settings',
            },
        ],
        [t],
    );

    const nameForm = useForm({
        name: workspace.name,
        color: workspace.color || 'slate',
        icon: workspace.icon || DEFAULT_WORKSPACE_ICON,
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
            <Head title={t('workspace_settings.title', 'Workspace settings')} />

            <div className="px-4 py-6">
                <Heading
                    title={t('workspace_settings.title', 'Workspace settings')}
                    description={t(
                        'workspace_settings.description',
                        'Manage general settings and members for this workspace.',
                    )}
                />

                <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:space-x-12">
                    <aside className="hidden w-full max-w-xl lg:block lg:w-56">
                        <nav
                            className="flex flex-col space-y-1"
                            aria-label={t('workspace_settings.title', 'Workspace settings')}
                        >
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={`w-full justify-start ${section === 'general' ? 'bg-muted' : ''}`}
                                onClick={() => setSection('general')}
                            >
                                <Settings2 className="size-4" />
                                {t('workspace_settings.general', 'General')}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={`w-full justify-start ${section === 'members' ? 'bg-muted' : ''}`}
                                onClick={() => setSection('members')}
                            >
                                <Users className="size-4" />
                                {t('workspace_settings.members', 'Members')}
                            </Button>
                        </nav>
                    </aside>

                    <div className="flex-1 md:max-w-3xl">
                        <Tabs value={section} onValueChange={(value) => setSection(value as 'general' | 'members')} className="space-y-6">
                            <TabsList className="w-full lg:hidden">
                                <TabsTrigger value="general" className="flex-1">
                                    <Settings2 className="size-4" />
                                    {t('workspace_settings.general', 'General')}
                                </TabsTrigger>
                                <TabsTrigger value="members" className="flex-1">
                                    <Users className="size-4" />
                                    {t('workspace_settings.members', 'Members')}
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>

                        {section === 'general' ? (
                            <section className="max-w-xl space-y-6">
                                <form
                                    className="space-y-6"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        nameForm.patch('/workspaces/settings', {
                                            preserveScroll: true,
                                        });
                                    }}
                                >
                                    <div className="grid gap-2">
                                        <Label htmlFor="workspace-name">
                                            {t('workspace_settings.name_label', 'Workspace name')}
                                        </Label>
                                        <Input
                                            id="workspace-name"
                                            value={nameForm.data.name}
                                            onChange={(event) =>
                                                nameForm.setData('name', event.target.value)
                                            }
                                        />
                                        <InputError message={nameForm.errors.name} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>{t('workspace_settings.icon_label', 'Workspace icon')}</Label>
                                        <IconPicker
                                            value={nameForm.data.icon}
                                            fallbackValue={DEFAULT_WORKSPACE_ICON}
                                            onValueChange={(icon) => nameForm.setData('icon', icon)}
                                            disabled={nameForm.processing}
                                        />
                                        <InputError message={nameForm.errors.icon} />
                                    </div>

                                    <div className="grid gap-2">
                                        <Label>{t('workspace_settings.color_label', 'Workspace color')}</Label>
                                        <ColorSwatchPicker
                                            value={nameForm.data.color}
                                            onValueChange={(color) => nameForm.setData('color', color)}
                                            options={COLOR_SWATCH_OPTIONS}
                                        />
                                        <InputError message={nameForm.errors.color} />
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <Button type="submit" disabled={nameForm.processing}>
                                            {t('workspace_settings.save', 'Save')}
                                        </Button>
                                        {status === 'workspace-updated' ? (
                                            <p className="text-sm text-muted-foreground">
                                                {t('workspace_settings.saved', 'Saved.')}
                                            </p>
                                        ) : null}
                                    </div>
                                </form>
                            </section>
                        ) : null}

                        {section === 'members' ? (
                            <section className="max-w-2xl space-y-6">
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
                                            placeholder={t(
                                                'workspace_settings.invite_email_placeholder',
                                                'user@example.com',
                                            )}
                                            value={addMemberForm.data.email}
                                            onChange={(event) =>
                                                addMemberForm.setData('email', event.target.value)
                                            }
                                        />
                                        <InputError message={addMemberForm.errors.email} />
                                    </div>
                                    <Button type="submit" disabled={addMemberForm.processing}>
                                        {t('workspace_settings.add_member', 'Add member')}
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
                                                        {t('workspace_settings.owner', 'Owner')}
                                                    </span>
                                                ) : (
                                                    <select
                                                        className="h-8 rounded-md border px-2 text-sm"
                                                        value={
                                                            member.role === 'owner'
                                                                ? 'owner'
                                                                : 'member'
                                                        }
                                                        onChange={(event) => {
                                                            roleForm.setData({
                                                                user_id: member.id,
                                                                role: event.target.value,
                                                            });

                                                            roleForm.patch(
                                                                '/workspaces/settings/members/role',
                                                                {
                                                                    preserveScroll: true,
                                                                },
                                                            );
                                                        }}
                                                        disabled={roleForm.processing}
                                                    >
                                                        <option value="member">
                                                            {t('workspace_settings.member', 'Member')}
                                                        </option>
                                                        <option value="owner">
                                                            {t('workspace_settings.owner', 'Owner')}
                                                        </option>
                                                    </select>
                                                )}

                                                {member.id !== workspace.owner_id ? (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={removeMemberForm.processing}
                                                        onClick={() => {
                                                            removeMemberForm.setData('user_id', member.id);
                                                            removeMemberForm.delete(
                                                                '/workspaces/settings/members',
                                                                {
                                                                    preserveScroll: true,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        {t('workspace_settings.remove', 'Remove')}
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <InputError message={roleForm.errors.role} />
                                <InputError message={removeMemberForm.errors.user_id} />

                                {status === 'owner-transferred' ||
                                status === 'member-role-updated' ||
                                status === 'member-added' ||
                                status === 'member-removed' ? (
                                    <p className="text-sm text-muted-foreground">
                                        {t('workspace_settings.changes_saved', 'Changes saved.')}
                                    </p>
                                ) : null}
                            </section>
                        ) : null}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
