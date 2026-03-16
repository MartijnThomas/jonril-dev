import { Head, router, useForm, usePage } from '@inertiajs/react';
import { CalendarDays, Check, Copy, RefreshCw, RotateCcw, Trash2, Unplug } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import * as CalendarController from '@/actions/App/Http/Controllers/CalendarController';
import { Switch } from '@/components/ui/switch';
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
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
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

type CalendarEntry = {
    id: string;
    name: string;
    provider: string;
    url: string;
    username: string;
    color: string | null;
    is_active: boolean;
    last_synced_at: string | null;
};

type Props = {
    workspace: {
        id: string;
        name: string;
        color: string;
        timeblock_color?: string | null;
        editor_mode: 'legacy' | 'block' | string;
        icon: string;
        owner_id: number;
        is_migrated_source?: boolean;
        can_migrate_to_block?: boolean;
    };
    members: Member[];
    calendars: CalendarEntry[];
    status?: string;
    migrationSummary?: {
        workspace: {
            id: string;
            name: string;
            slug: string;
        };
        notes: {
            total: number;
            normal: number;
            journal: number;
        };
    } | null;
};

export default function WorkspaceSettings({ workspace, members, calendars, status, migrationSummary }: Props) {
    const { t } = useI18n();
    const page = usePage();
    const authUserRole = (
        page.props as {
            auth?: {
                user?: {
                    role?: string;
                };
            };
        }
    ).auth?.user?.role;
    const url = useMemo(() => new URL(page.url, window.location.origin), [page.url]);
    const sectionParam = url.searchParams.get('section');
    const section: 'general' | 'members' | 'calendars' | 'advanced' =
        sectionParam === 'members' || sectionParam === 'calendars' || sectionParam === 'advanced'
            ? sectionParam
            : 'general';
    const [workspaceIdCopied, setWorkspaceIdCopied] = useState(false);
    const [openColorPicker, setOpenColorPicker] = useState(false);
    const [openTimeblockColorPicker, setOpenTimeblockColorPicker] = useState(false);
    const workspaceReadOnly = workspace.is_migrated_source === true;
    const canReactivateWorkspace = authUserRole === 'admin' && workspaceReadOnly;
    const deleteWorkspaceForm = useForm({});

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
        editor_mode: workspace.editor_mode || 'legacy',
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

    const connectCalendarForm = useForm({
        name: '',
        url: '',
        username: '',
        password: '',
    });

    const [syncingCalendarId, setSyncingCalendarId] = useState<string | null>(null);
    const [togglingCalendarId, setTogglingCalendarId] = useState<string | null>(null);

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
                                        if (workspaceReadOnly) {
                                            return;
                                        }

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
                                            disabled={workspaceReadOnly || nameForm.processing}
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
                                                    disabled={workspaceReadOnly || nameForm.processing}
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
                                                                disabled={workspaceReadOnly || nameForm.processing}
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
                                                        disabled={workspaceReadOnly || nameForm.processing}
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
                                                                disabled={workspaceReadOnly || nameForm.processing}
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
                                        {workspaceReadOnly ? (
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    'workspace_settings.read_only_migrated_workspace',
                                                    'This migrated source workspace is read-only.',
                                                )}
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
                                        if (workspaceReadOnly) {
                                            return;
                                        }

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
                                            disabled={workspaceReadOnly || addMemberForm.processing}
                                        />
                                        <InputError message={addMemberForm.errors.email} />
                                    </div>
                                    <Button type="submit" disabled={workspaceReadOnly || addMemberForm.processing}>
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
                                                            if (workspaceReadOnly) {
                                                                return;
                                                            }

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
                                                        disabled={workspaceReadOnly || roleForm.processing}
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
                                                        disabled={
                                                            workspaceReadOnly ||
                                                            removeMemberForm.processing
                                                        }
                                                        onClick={() => {
                                                            if (workspaceReadOnly) {
                                                                return;
                                                            }

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
                                {workspaceReadOnly ? (
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            'workspace_settings.read_only_migrated_workspace',
                                            'This migrated source workspace is read-only.',
                                        )}
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
                                    <form
                                        className="mb-6 space-y-4 border-b pb-6"
                                        onSubmit={(event) => {
                                            event.preventDefault();
                                            if (workspaceReadOnly) {
                                                return;
                                            }

                                            nameForm.patch(`/settings/workspaces/${workspace.id}`, {
                                                preserveScroll: true,
                                            });
                                        }}
                                    >
                                        <div className="grid items-center gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                                            <Label htmlFor="workspace-editor-mode">
                                                {t(
                                                    'workspace_settings.editor_mode_label',
                                                    'Editor mode',
                                                )}
                                            </Label>

                                            <div className="space-y-2">
                                                <Select
                                                    value={nameForm.data.editor_mode}
                                                    onValueChange={(value) =>
                                                        nameForm.setData('editor_mode', value)
                                                    }
                                                    disabled={workspaceReadOnly || nameForm.processing}
                                                >
                                                    <SelectTrigger id="workspace-editor-mode">
                                                        <SelectValue
                                                            placeholder={t(
                                                                'workspace_settings.editor_mode_label',
                                                                'Editor mode',
                                                            )}
                                                        />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="legacy">
                                                            {t(
                                                                'workspace_settings.editor_mode_legacy',
                                                                'Legacy',
                                                            )}
                                                        </SelectItem>
                                                        <SelectItem value="block">
                                                            {t(
                                                                'workspace_settings.editor_mode_block',
                                                                'Block',
                                                            )}
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>

                                                <p className="text-sm text-muted-foreground">
                                                    {t(
                                                        'workspace_settings.editor_mode_description',
                                                        'Choose which editor behavior model this workspace uses.',
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        <InputError message={nameForm.errors.editor_mode} />

                                        <div className="flex items-center gap-3">
                                            <Button type="submit" disabled={workspaceReadOnly || nameForm.processing}>
                                                {t('workspace_settings.save', 'Save')}
                                            </Button>
                                            {status === 'workspace-updated' ? (
                                                <p className="text-sm text-muted-foreground">
                                                    {t('workspace_settings.saved', 'Saved.')}
                                                </p>
                                            ) : null}
                                            {workspaceReadOnly ? (
                                                <p className="text-sm text-muted-foreground">
                                                    {t(
                                                        'workspace_settings.read_only_migrated_workspace',
                                                        'This migrated source workspace is read-only.',
                                                    )}
                                                </p>
                                            ) : null}
                                        </div>
                                    </form>

                                    <div className="mb-6 space-y-3 border-b pb-6">
                                        <div className="space-y-1">
                                            <Label>{t('workspace_settings.migrate_to_block_label', 'Migrate to block workspace')}</Label>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    'workspace_settings.migrate_to_block_description',
                                                    'Duplicate this legacy workspace, convert the copy to block mode, and lock this source workspace as migrated.',
                                                )}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                disabled={
                                                    workspaceReadOnly ||
                                                    !workspace.can_migrate_to_block
                                                }
                                                onClick={() => {
                                                    if (workspaceReadOnly) {
                                                        return;
                                                    }

                                                    if (
                                                        !window.confirm(
                                                            t(
                                                                'workspace_settings.migrate_to_block_confirm',
                                                                'Create a block-mode copy and mark this legacy workspace as migrated?',
                                                            ),
                                                        )
                                                    ) {
                                                        return;
                                                    }

                                                    nameForm.post(
                                                        `/settings/workspaces/${workspace.id}/migrate`,
                                                        {
                                                            preserveScroll: true,
                                                        },
                                                    );
                                                }}
                                            >
                                                {t('workspace_settings.migrate_to_block_action', 'Migrate workspace')}
                                            </Button>

                                            {workspace.is_migrated_source ? (
                                                <p className="text-sm text-muted-foreground">
                                                    {t(
                                                        'workspace_settings.migrate_to_block_done',
                                                        'This workspace is already marked as migrated.',
                                                    )}
                                                </p>
                                            ) : null}
                                            {status === 'workspace-migrated' ? (
                                                <p className="text-sm text-muted-foreground">
                                                    {t(
                                                        'workspace_settings.migrate_to_block_success',
                                                        'Workspace migration started successfully.',
                                                    )}
                                                </p>
                                            ) : null}
                                            {status === 'workspace-reactivated' ? (
                                                <p className="text-sm text-muted-foreground">
                                                    {t(
                                                        'workspace_settings.workspace_reactivated',
                                                        'Workspace is enabled again.',
                                                    )}
                                                </p>
                                            ) : null}
                                        </div>

                                        {canReactivateWorkspace ? (
                                            <div className="pt-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => {
                                                        if (
                                                            !window.confirm(
                                                                t(
                                                                    'workspace_settings.reactivate_workspace_confirm',
                                                                    'Enable this migrated workspace again?',
                                                                ),
                                                            )
                                                        ) {
                                                            return;
                                                        }

                                                        router.post(
                                                            `/settings/workspaces/${workspace.id}/reactivate`,
                                                            {},
                                                            {
                                                                preserveScroll: true,
                                                            },
                                                        );
                                                    }}
                                                >
                                                    {t(
                                                        'workspace_settings.reactivate_workspace_action',
                                                        'Enable workspace again',
                                                    )}
                                                </Button>
                                            </div>
                                        ) : null}

                                    </div>

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

                                    {migrationSummary ? (
                                        <div className="mt-6 space-y-3 border-t pt-6">
                                            <p className="text-sm font-medium">
                                                {t(
                                                    'workspace_settings.migrated_workspaces_heading',
                                                    'Migrated workspaces',
                                                )}
                                            </p>
                                            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                                                <p className="text-sm font-medium">
                                                    {t('workspace_settings.migration_summary_title', 'Migrated copy')}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {migrationSummary.workspace.name}
                                                </p>
                                                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                                                    <span>
                                                        {t('workspace_settings.migration_notes_total', 'Total')}: {migrationSummary.notes.total}
                                                    </span>
                                                    <span>
                                                        {t('workspace_settings.migration_notes_normal', 'Normal')}: {migrationSummary.notes.normal}
                                                    </span>
                                                    <span>
                                                        {t('workspace_settings.migration_notes_journal', 'Journal')}: {migrationSummary.notes.journal}
                                                    </span>
                                                </div>
                                                <div>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            router.post(
                                                                '/workspaces/switch',
                                                                {
                                                                    workspace_id:
                                                                        migrationSummary.workspace.id,
                                                                },
                                                                {
                                                                    preserveScroll: true,
                                                                },
                                                            );
                                                        }}
                                                    >
                                                        {t(
                                                            'workspace_settings.switch_to_migrated_workspace',
                                                            'Switch to migrated workspace',
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="mt-6 border-t pt-6">
                                        <div className="space-y-4 rounded-lg border border-red-100 bg-red-50 p-4 dark:border-red-200/10 dark:bg-red-700/10">
                                            <div className="space-y-1 text-red-700 dark:text-red-200">
                                                <p className="text-sm font-medium">
                                                    {t(
                                                        'workspace_settings.delete_workspace_title',
                                                        'Delete workspace',
                                                    )}
                                                </p>
                                                <p className="text-sm">
                                                    {t(
                                                        'workspace_settings.delete_workspace_description',
                                                        'Delete this workspace and all of its data. This action cannot be undone.',
                                                    )}
                                                </p>
                                            </div>

                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button
                                                        type="button"
                                                        variant="destructive"
                                                        disabled={deleteWorkspaceForm.processing}
                                                    >
                                                        <Trash2 className="mr-2 h-4 w-4" />
                                                        {t(
                                                            'workspace_settings.delete_workspace_action',
                                                            'Delete workspace',
                                                        )}
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogTitle>
                                                        {t(
                                                            'workspace_settings.delete_workspace_confirm_title',
                                                            'Are you sure you want to delete this workspace?',
                                                        )}
                                                    </DialogTitle>
                                                    <DialogDescription>
                                                        {t(
                                                            'workspace_settings.delete_workspace_confirm_description',
                                                            'All workspace notes, journals, and related data will be permanently removed.',
                                                        )}
                                                    </DialogDescription>

                                                    <DialogFooter className="gap-2">
                                                        <DialogClose asChild>
                                                            <Button
                                                                type="button"
                                                                variant="secondary"
                                                            >
                                                                {t('workspace_settings.cancel', 'Cancel')}
                                                            </Button>
                                                        </DialogClose>
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            disabled={deleteWorkspaceForm.processing}
                                                            onClick={() => {
                                                                deleteWorkspaceForm.delete(
                                                                    `/settings/workspaces/${workspace.id}`,
                                                                    {
                                                                        preserveScroll: true,
                                                                    },
                                                                );
                                                            }}
                                                        >
                                                            {t(
                                                                'workspace_settings.delete_workspace_action',
                                                                'Delete workspace',
                                                            )}
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                </div>
                    </section>
                ) : null}

                {section === 'calendars' ? (
                    <section className="max-w-xl space-y-8">
                        <Heading
                            variant="small"
                            title={t('workspace_settings.calendars', 'Calendars')}
                            description={t(
                                'workspace_settings.calendars_description',
                                'Connect external calendars to sync events into this workspace.',
                            )}
                        />

                        {calendars.length > 0 ? (
                            <div className="space-y-3">
                                {calendars.map((calendar) => (
                                    <div
                                        key={calendar.id}
                                        className="flex items-center gap-3 rounded-lg border border-border/60 px-4 py-3"
                                    >
                                        <div className="relative shrink-0">
                                            <CalendarDays className="size-5 text-muted-foreground" />
                                            {calendar.color ? (
                                                <span
                                                    className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-1 ring-background"
                                                    style={{ backgroundColor: calendar.color }}
                                                />
                                            ) : null}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{calendar.name}</p>
                                            <p className="truncate text-xs text-muted-foreground">{calendar.username} · {calendar.provider.toUpperCase()}</p>
                                            {calendar.last_synced_at ? (
                                                <p className="text-xs text-muted-foreground">
                                                    {t('workspace_settings.last_synced', 'Last synced')}: {new Date(calendar.last_synced_at).toLocaleString()}
                                                </p>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">
                                                    {t('workspace_settings.never_synced', 'Never synced')}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <Switch
                                                size="sm"
                                                checked={calendar.is_active}
                                                disabled={togglingCalendarId === calendar.id}
                                                aria-label={t('workspace_settings.calendar_active_label', 'Show in sidebar')}
                                                onCheckedChange={(checked) => {
                                                    setTogglingCalendarId(calendar.id);
                                                    router.patch(
                                                        CalendarController.update({ workspace: workspace.id, calendar: calendar.id }).url,
                                                        { is_active: checked },
                                                        {
                                                            preserveScroll: true,
                                                            onFinish: () => setTogglingCalendarId(null),
                                                        },
                                                    );
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                disabled={syncingCalendarId === calendar.id}
                                                onClick={() => {
                                                    setSyncingCalendarId(calendar.id);
                                                    router.post(
                                                        CalendarController.sync({ workspace: workspace.id, calendar: calendar.id }).url,
                                                        {},
                                                        {
                                                            preserveScroll: true,
                                                            onFinish: () => setSyncingCalendarId(null),
                                                        },
                                                    );
                                                }}
                                            >
                                                <RefreshCw className={`size-4 ${syncingCalendarId === calendar.id ? 'animate-spin' : ''}`} />
                                            </Button>
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button type="button" size="sm" variant="ghost">
                                                        <Unplug className="size-4 text-destructive" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent>
                                                    <DialogTitle>
                                                        {t('workspace_settings.disconnect_calendar_title', 'Disconnect calendar')}
                                                    </DialogTitle>
                                                    <DialogDescription>
                                                        {t(
                                                            'workspace_settings.disconnect_calendar_description',
                                                            'This will remove the calendar connection and all synced events.',
                                                        )}
                                                    </DialogDescription>
                                                    <DialogFooter className="gap-2">
                                                        <DialogClose asChild>
                                                            <Button type="button" variant="secondary">
                                                                {t('workspace_settings.cancel', 'Cancel')}
                                                            </Button>
                                                        </DialogClose>
                                                        <Button
                                                            type="button"
                                                            variant="destructive"
                                                            onClick={() => {
                                                                router.delete(
                                                                    CalendarController.destroy({ workspace: workspace.id, calendar: calendar.id }).url,
                                                                    { preserveScroll: true },
                                                                );
                                                            }}
                                                        >
                                                            {t('workspace_settings.disconnect', 'Disconnect')}
                                                        </Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        <div className="space-y-4 rounded-lg border border-border/60 p-4">
                            <p className="text-sm font-medium">
                                {t('workspace_settings.connect_caldav', 'Connect a CalDAV calendar')}
                            </p>
                            <form
                                className="space-y-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    connectCalendarForm.post(
                                        CalendarController.store({ workspace: workspace.id }).url,
                                        {
                                            preserveScroll: true,
                                            onSuccess: () => connectCalendarForm.reset(),
                                        },
                                    );
                                }}
                            >
                                <div className="grid gap-2">
                                    <Label htmlFor="calendar-name">
                                        {t('workspace_settings.calendar_name_label', 'Calendar name')}
                                    </Label>
                                    <Input
                                        id="calendar-name"
                                        placeholder={t('workspace_settings.calendar_name_placeholder', 'My iCloud Calendar')}
                                        value={connectCalendarForm.data.name}
                                        onChange={(e) => connectCalendarForm.setData('name', e.target.value)}
                                        disabled={connectCalendarForm.processing}
                                    />
                                    <InputError message={connectCalendarForm.errors.name} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="calendar-url">
                                        {t('workspace_settings.calendar_url_label', 'CalDAV URL')}
                                    </Label>
                                    <Input
                                        id="calendar-url"
                                        type="url"
                                        placeholder="https://caldav.icloud.com/..."
                                        value={connectCalendarForm.data.url}
                                        onChange={(e) => connectCalendarForm.setData('url', e.target.value)}
                                        disabled={connectCalendarForm.processing}
                                    />
                                    <InputError message={connectCalendarForm.errors.url} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="calendar-username">
                                        {t('workspace_settings.calendar_username_label', 'Username')}
                                    </Label>
                                    <Input
                                        id="calendar-username"
                                        placeholder="user@icloud.com"
                                        value={connectCalendarForm.data.username}
                                        onChange={(e) => connectCalendarForm.setData('username', e.target.value)}
                                        disabled={connectCalendarForm.processing}
                                    />
                                    <InputError message={connectCalendarForm.errors.username} />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="calendar-password">
                                        {t('workspace_settings.calendar_password_label', 'Password / App password')}
                                    </Label>
                                    <Input
                                        id="calendar-password"
                                        type="password"
                                        value={connectCalendarForm.data.password}
                                        onChange={(e) => connectCalendarForm.setData('password', e.target.value)}
                                        disabled={connectCalendarForm.processing}
                                    />
                                    <InputError message={connectCalendarForm.errors.password} />
                                </div>

                                <InputError message={(connectCalendarForm.errors as Record<string, string>).calendar} />

                                <Button type="submit" disabled={connectCalendarForm.processing}>
                                    {t('workspace_settings.connect_calendar_action', 'Connect calendar')}
                                </Button>
                            </form>
                        </div>
                    </section>
                ) : null}
            </SettingsLayout>
        </AppLayout>
    );
}
