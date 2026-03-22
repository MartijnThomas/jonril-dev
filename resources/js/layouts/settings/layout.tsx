import { Link, router, usePage } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { useI18n } from '@/lib/i18n';
import { cn, toUrl } from '@/lib/utils';
import { edit as editAppearance } from '@/routes/appearance';
import { edit as editEditorPreferences } from '@/routes/editor-preferences';
import { edit } from '@/routes/profile';
import { show } from '@/routes/two-factor';
import { edit as editPassword } from '@/routes/user-password';
type SharedWorkspace = {
    id: string;
    name: string;
    color: string;
    icon: string;
    role: string;
    is_personal?: boolean;
    is_migrated_source?: boolean;
};

type PageProps = {
    auth?: {
        user?: {
            role?: string | null;
        } | null;
    } | null;
    workspaces?: SharedWorkspace[];
    currentWorkspace?: {
        id: string;
    } | null;
};

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { t } = useI18n();
    const { isCurrentOrParentUrl } = useCurrentUrl();
    const page = usePage<PageProps>();
    const { workspaces = [], currentWorkspace = null } = page.props;
    const isAdmin = page.props.auth?.user?.role === 'admin';
    const currentUrl = new URL(page.url, window.location.origin);
    const currentPath = currentUrl.pathname;
    const currentSection = currentUrl.searchParams.get('section') ?? 'general';
    const workspaceMatch = currentPath.match(/^\/settings\/workspaces\/([^/]+)$/);
    const currentSettingsWorkspaceId = workspaceMatch ? workspaceMatch[1] : null;

    const ownerWorkspaces = useMemo(() => {
        const owned = workspaces
            .filter((workspace) => workspace.role === 'owner')
            .sort((a, b) => a.name.localeCompare(b.name));

        return {
            active: owned.filter((workspace) => workspace.is_migrated_source !== true),
            migrated: owned.filter((workspace) => workspace.is_migrated_source === true),
        };
    }, [workspaces]);
    const profileNavItems = [
        {
            title: t('settings_nav.profile', 'Profile'),
            href: edit(),
        },
        {
            title: t('settings_nav.password', 'Password'),
            href: editPassword(),
        },
        {
            title: t('settings_nav.two_factor', 'Two-factor auth'),
            href: show(),
        },
        {
            title: t('settings_nav.appearance', 'Appearance'),
            href: editAppearance(),
        },
    ];
    const tasksEditorNavItems = [
        {
            title: t('settings_nav.editor_preferences', 'Editor preferences'),
            href: editEditorPreferences(),
        },
        {
            title: t('settings_nav.task_filters', 'Task filters'),
            href: '/settings/task-filters',
        },
    ];
    const workspaceNavItems = [
        { key: 'general', label: t('workspace_settings.general', 'General') },
        { key: 'members', label: t('workspace_settings.members', 'Members') },
        { key: 'calendars', label: t('workspace_settings.calendars', 'Calendars') },
        { key: 'advanced', label: t('workspace_settings.advanced', 'Advanced') },
    ] as const;
    const workspaceTabTargetId =
        currentSettingsWorkspaceId ?? currentWorkspace?.id ?? ownerWorkspaces.active[0]?.id ?? ownerWorkspaces.migrated[0]?.id ?? null;
    const workspaceTabHref = workspaceTabTargetId
        ? `/settings/workspaces/${workspaceTabTargetId}`
        : '/settings/profile';
    const topTabs = [
        {
            key: 'profile',
            label: t('settings_nav.tab_profile', 'Profile'),
            href: edit(),
            active: currentPath.startsWith('/settings/profile')
                || currentPath.startsWith('/settings/password')
                || currentPath.startsWith('/settings/two-factor')
                || currentPath.startsWith('/settings/appearance'),
        },
        {
            key: 'tasks_editor',
            label: t('settings_nav.tab_tasks_editor', 'Tasks & Editor'),
            href: editEditorPreferences(),
            active: currentPath.startsWith('/settings/editor-preferences')
                || currentPath.startsWith('/settings/task-filters'),
        },
        {
            key: 'workspace',
            label: t('settings_nav.tab_workspace', 'Workspace'),
            href: workspaceTabHref,
            active: currentPath.startsWith('/settings/workspaces/'),
        },
        ...(isAdmin
            ? [
                  {
                      key: 'admin',
                      label: t('settings_nav.tab_admin', 'Admin'),
                      href: '/settings/admin/operations',
                      active: currentPath.startsWith('/settings/admin/'),
                  },
              ]
            : []),
    ];
    const activeTopTab = topTabs.find((tab) => tab.active)?.key ?? 'profile';
    const selectedWorkspace = workspaces.find(
        (workspace) => workspace.id === currentSettingsWorkspaceId,
    );
    const canShowWorkspaceSidebar =
        activeTopTab === 'workspace' && selectedWorkspace !== undefined;
    const canShowAdminSidebar = activeTopTab === 'admin' && isAdmin;

    if (typeof window === 'undefined') {
        return null;
    }

    return (
        <div className="flex-1 overflow-y-auto px-4 py-6">
            <Heading
                title={t('settings.title', 'Settings')}
                description={t(
                    'settings.description',
                    'Manage your profile and workspace settings',
                )}
            />

            <div className="mb-6">
                <div className="inline-flex rounded-lg border bg-muted/40 p-1">
                    {topTabs.map((tab) => (
                        <Button
                            key={tab.key}
                            type="button"
                            size="sm"
                            variant={tab.active ? 'default' : 'ghost'}
                            className="rounded-md"
                            onClick={() =>
                                router.visit(toUrl(tab.href), {
                                    preserveScroll: true,
                                })
                            }
                        >
                            {tab.label}
                        </Button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:space-x-8">
                <aside className="w-full max-w-xl lg:w-56">
                    <nav className="flex flex-col gap-4" aria-label={t('settings.title', 'Settings')}>
                        {activeTopTab === 'profile' ? (
                            <div className="space-y-1">
                                <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {t('settings.profile_section', 'Profile')}
                                </p>
                                {profileNavItems.map((item, index) => (
                                    <Button
                                        key={`${toUrl(item.href)}-${index}`}
                                        size="sm"
                                        variant="ghost"
                                        asChild
                                        className={cn('w-full justify-start', {
                                            'bg-muted': isCurrentOrParentUrl(item.href),
                                        })}
                                    >
                                        <Link href={item.href}>{item.title}</Link>
                                    </Button>
                                ))}
                            </div>
                        ) : null}

                        {activeTopTab === 'tasks_editor' ? (
                            <div className="space-y-1">
                                <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {t('settings_nav.tab_tasks_editor', 'Tasks & Editor')}
                                </p>
                                {tasksEditorNavItems.map((item, index) => (
                                    <Button
                                        key={`${toUrl(item.href)}-${index}`}
                                        size="sm"
                                        variant="ghost"
                                        asChild
                                        className={cn('w-full justify-start', {
                                            'bg-muted': isCurrentOrParentUrl(item.href),
                                        })}
                                    >
                                        <Link href={item.href}>{item.title}</Link>
                                    </Button>
                                ))}
                            </div>
                        ) : null}

                        {canShowWorkspaceSidebar && selectedWorkspace ? (
                            <div className="space-y-3">
                                <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {t('settings.workspaces_section', 'Workspaces')}
                                </p>
                                <Select
                                    value={selectedWorkspace.id}
                                    onValueChange={(workspaceId) => {
                                        const nextSection =
                                            currentSection === 'calendars'
                                            && !workspaces.find((workspace) => workspace.id === workspaceId)?.is_personal
                                                ? 'general'
                                                : currentSection;
                                        router.get(
                                            `/settings/workspaces/${workspaceId}?section=${nextSection}`,
                                            {},
                                            { preserveScroll: true },
                                        );
                                    }}
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ownerWorkspaces.active.map((workspace) => (
                                            <SelectItem key={workspace.id} value={workspace.id}>
                                                {workspace.name}
                                            </SelectItem>
                                        ))}
                                        {ownerWorkspaces.migrated.length > 0 ? (
                                            <div className="px-2 py-1 text-[10px] tracking-wide text-muted-foreground uppercase">
                                                {t(
                                                    'settings.migrated_workspaces_section',
                                                    'Migrated workspaces',
                                                )}
                                            </div>
                                        ) : null}
                                        {ownerWorkspaces.migrated.map((workspace) => (
                                            <SelectItem key={workspace.id} value={workspace.id}>
                                                {workspace.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>

                                <div className="space-y-1">
                                    {workspaceNavItems.map((item) => {
                                        if (item.key === 'calendars' && !selectedWorkspace.is_personal) {
                                            return null;
                                        }

                                        return (
                                            <Button
                                                key={item.key}
                                                size="sm"
                                                variant="ghost"
                                                asChild
                                                className={cn('w-full justify-start', {
                                                    'bg-muted': currentSection === item.key,
                                                })}
                                            >
                                                <Link
                                                    href={`/settings/workspaces/${selectedWorkspace.id}?section=${item.key}`}
                                                >
                                                    {item.label}
                                                </Link>
                                            </Button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

                        {canShowAdminSidebar ? (
                            <div className="space-y-1">
                                <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                    {t('settings_nav.tab_admin', 'Admin')}
                                </p>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    asChild
                                    className={cn('w-full justify-start', {
                                        'bg-muted': currentPath === '/settings/admin/operations',
                                    })}
                                >
                                    <Link href="/settings/admin/operations">
                                        {t('settings_nav.operations', 'Operations')}
                                    </Link>
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    asChild
                                    className={cn('w-full justify-start', {
                                        'bg-muted': currentPath === '/settings/admin/maintenance',
                                    })}
                                >
                                    <Link href="/settings/admin/maintenance">
                                        {t('settings_nav.maintenance', 'Maintenance')}
                                    </Link>
                                </Button>
                            </div>
                        ) : null}
                    </nav>
                </aside>

                <Separator className="my-6 lg:hidden" />

                <div className="flex-1 md:max-w-3xl">
                    <section className="space-y-8">{children}</section>
                </div>
            </div>
        </div>
    );
}
