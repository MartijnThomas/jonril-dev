import { Head, useForm, usePage } from '@inertiajs/react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import {
    COLOR_SWATCH_OPTIONS,
    ColorSwatchPicker,
    getColorSwatchPreviewClasses,
} from '@/components/color-swatch-picker';
import Heading from '@/components/heading';
import { DEFAULT_WORKSPACE_ICON, IconPicker } from '@/components/icon-picker';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
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
        timeblock_color?: string | null;
        icon: string;
        owner_id: number;
    };
    members: Member[];
    status?: string;
};

export default function WorkspaceSettings({ workspace, members, status }: Props) {
    const { t } = useI18n();
    const page = usePage();
    const url = useMemo(() => new URL(page.url, window.location.origin), [page.url]);
    const sectionParam = url.searchParams.get('section');
    const section: 'general' | 'members' | 'advanced' =
        sectionParam === 'members' || sectionParam === 'advanced'
            ? sectionParam
            : 'general';
    const [workspaceIdCopied, setWorkspaceIdCopied] = useState(false);
    const [openColorPicker, setOpenColorPicker] = useState(false);
    const [openTimeblockColorPicker, setOpenTimeblockColorPicker] = useState(false);

    useEffect(() => {
        if (!workspaceIdCopied) {
            return;
        }

        const timeout = window.setTimeout(() => {
            setWorkspaceIdCopied(false);
        }, 2500);

        return () => {
            window.clearTimeout(timeout);
        };
    }, [workspaceIdCopied]);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('workspace_settings.title', 'Workspace settings'),
                href: `/settings/workspaces/${workspace.id}`,
            },
        ],
        [t, workspace.id],
    );

    const nameForm = useForm({
        name: workspace.name,
        color: workspace.color || 'slate',
        timeblock_color: workspace.timeblock_color || '',
        icon: workspace.icon || DEFAULT_WORKSPACE_ICON,
    });
    const colorSwatchPreview = getColorSwatchPreviewClasses(nameForm.data.color);
    const timeblockColorPreview = getColorSwatchPreviewClasses(
        nameForm.data.timeblock_color || nameForm.data.color,
    );

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
            <h1 className="sr-only">{t('workspace_settings.title', 'Workspace settings')}</h1>

            <SettingsLayout>
                {section === 'general' ? (
                    <section className="max-w-xl space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('workspace_settings.general', 'General')}
                                    description={t(
                                        'workspace_settings.general_description',
                                        'Update the name, icon and color for this workspace.',
                                    )}
                                />
                                <form
                                    className="space-y-6"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        nameForm.patch(`/settings/workspaces/${workspace.id}`, {
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

                                    <div className="grid gap-3">
                                        <div className="grid items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto_auto]">
                                            <Label>{t('workspace_settings.icon_label', 'Workspace icon')}</Label>

                                            <div className="min-w-0">
                                                <IconPicker
                                                    value={nameForm.data.icon}
                                                    fallbackValue={DEFAULT_WORKSPACE_ICON}
                                                    onValueChange={(icon) => nameForm.setData('icon', icon)}
                                                    disabled={nameForm.processing}
                                                />
                                            </div>

                                            <Popover
                                                open={openColorPicker}
                                                onOpenChange={setOpenColorPicker}
                                            >
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center p-0"
                                                                aria-label={t('workspace_settings.color_label', 'Workspace color')}
                                                            >
                                                                <span
                                                                    className="relative h-7 w-7 rounded-full border border-border/70"
                                                                    aria-hidden="true"
                                                                >
                                                                    <span className="absolute inset-[2px] grid grid-cols-2 overflow-hidden rounded-full">
                                                                        <span className={colorSwatchPreview.light} />
                                                                        <span className={colorSwatchPreview.dark} />
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        </PopoverTrigger>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                        {t('workspace_settings.color_label', 'Workspace color')}
                                                    </TooltipContent>
                                                </Tooltip>
                                                <PopoverContent
                                                    align="end"
                                                    className="w-64 space-y-2 p-3"
                                                    onCloseAutoFocus={(event) =>
                                                        event.preventDefault()
                                                    }
                                                >
                                                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                        {t('workspace_settings.color_label', 'Workspace color')}
                                                    </p>
                                                    <ColorSwatchPicker
                                                        value={nameForm.data.color}
                                                        onValueChange={(color) => {
                                                            nameForm.setData('color', color);
                                                            setOpenColorPicker(false);
                                                        }}
                                                        options={COLOR_SWATCH_OPTIONS}
                                                    />
                                                </PopoverContent>
                                            </Popover>

                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <button
                                                        type="button"
                                                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                                        aria-label={t('workspace_settings.back_to_default_icon', 'Reset icon to default')}
                                                        onClick={() => {
                                                            nameForm.setData('icon', DEFAULT_WORKSPACE_ICON);
                                                        }}
                                                    >
                                                        <RotateCcw className="h-4 w-4" />
                                                    </button>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    {t('workspace_settings.back_to_default_icon', 'Reset icon to default')}
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>

                                        <InputError message={nameForm.errors.icon} />
                                        <InputError message={nameForm.errors.color} />
                                    </div>

                                    <div className="grid gap-3">
                                        <div className="grid items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto]">
                                            <Label>
                                                {t(
                                                    'workspace_settings.timeblock_color_label',
                                                    'Timeblock color',
                                                )}
                                            </Label>

                                            <div className="text-sm text-muted-foreground">
                                                {t(
                                                    'workspace_settings.timeblock_color_description',
                                                    'Used for timeblock accents in the sidebar events list.',
                                                )}
                                            </div>

                                            <Popover
                                                open={openTimeblockColorPicker}
                                                onOpenChange={setOpenTimeblockColorPicker}
                                            >
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                type="button"
                                                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center p-0"
                                                                aria-label={t('workspace_settings.timeblock_color_label', 'Timeblock color')}
                                                            >
                                                                <span
                                                                    className="relative h-7 w-7 rounded-full border border-border/70"
                                                                    aria-hidden="true"
                                                                >
                                                                    <span className="absolute inset-[2px] grid grid-cols-2 overflow-hidden rounded-full">
                                                                        <span className={timeblockColorPreview.light} />
                                                                        <span className={timeblockColorPreview.dark} />
                                                                    </span>
                                                                </span>
                                                            </button>
                                                        </PopoverTrigger>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                        {t('workspace_settings.timeblock_color_label', 'Timeblock color')}
                                                    </TooltipContent>
                                                </Tooltip>
                                                <PopoverContent
                                                    align="end"
                                                    className="w-64 space-y-2 p-3"
                                                    onCloseAutoFocus={(event) =>
                                                        event.preventDefault()
                                                    }
                                                >
                                                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                        {t('workspace_settings.timeblock_color_label', 'Timeblock color')}
                                                    </p>
                                                    <ColorSwatchPicker
                                                        value={nameForm.data.timeblock_color || 'default'}
                                                        onValueChange={(color) => {
                                                            nameForm.setData(
                                                                'timeblock_color',
                                                                color === 'default' ? '' : color,
                                                            );
                                                            setOpenTimeblockColorPicker(false);
                                                        }}
                                                        options={COLOR_SWATCH_OPTIONS}
                                                        includeDefault
                                                        defaultLabel={t(
                                                            'workspace_settings.timeblock_color_default',
                                                            'Use workspace color',
                                                        )}
                                                    />
                                                </PopoverContent>
                                            </Popover>
                                        </div>

                                        <InputError message={nameForm.errors.timeblock_color} />
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
                                <Heading
                                    variant="small"
                                    title={t('workspace_settings.members', 'Members')}
                                    description={t(
                                        'workspace_settings.members_description',
                                        'Manage who has access to this workspace and their roles.',
                                    )}
                                />
                                <form
                                    className="flex flex-col gap-3 sm:flex-row"
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        addMemberForm.post(`/settings/workspaces/${workspace.id}/members`, {
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
                                                                `/settings/workspaces/${workspace.id}/members/role`,
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
                                                                `/settings/workspaces/${workspace.id}/members`,
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

                {section === 'advanced' ? (
                    <section className="max-w-2xl space-y-6">
                                <Heading
                                    variant="small"
                                    title={t('workspace_settings.advanced', 'Advanced')}
                                    description={t(
                                        'workspace_settings.advanced_description',
                                        'Technical and read-only workspace values.',
                                    )}
                                />
                                <div className="rounded-xl border bg-card p-5">
                                    <div className="space-y-2">
                                        <Label>
                                            {t('workspace_settings.workspace_id_label', 'Workspace ID')}
                                        </Label>
                                        <div className="flex w-full max-w-xl">
                                            <div
                                                id="workspace-id"
                                                className="flex h-9 flex-1 items-center rounded-l-md rounded-r-none border border-r-0 bg-muted/30 px-3 font-mono text-sm text-muted-foreground"
                                            >
                                                {workspace.id}
                                            </div>
                                            <CopyToClipboard
                                                text={workspace.id}
                                                onCopy={() => setWorkspaceIdCopied(true)}
                                            >
                                                <Button
                                                    type="button"
                                                    aria-label={t(
                                                        'workspace_settings.copy_workspace_id',
                                                        'Copy workspace ID',
                                                    )}
                                                    className="relative h-9 w-9 shrink-0 rounded-l-none rounded-r-md border border-black bg-black p-0 text-white transition-colors duration-200 hover:bg-black/85"
                                                >
                                                    <span
                                                        className={`absolute inset-0 inline-flex items-center justify-center transition-all duration-300 ease-out ${
                                                            workspaceIdCopied
                                                                ? 'scale-75 -rotate-12 opacity-0'
                                                                : 'scale-100 rotate-0 opacity-100'
                                                        }`}
                                                    >
                                                        <Copy className="size-4" />
                                                    </span>
                                                    <span
                                                        className={`pointer-events-none absolute inset-0 inline-flex items-center justify-center transition-all duration-300 ease-out ${
                                                            workspaceIdCopied
                                                                ? 'scale-100 rotate-0 opacity-100'
                                                                : 'scale-75 rotate-12 opacity-0'
                                                        }`}
                                                    >
                                                        <Check className="size-4" />
                                                    </span>
                                                </Button>
                                            </CopyToClipboard>
                                        </div>
                                    </div>
                                </div>
                    </section>
                ) : null}
            </SettingsLayout>
        </AppLayout>
    );
}
