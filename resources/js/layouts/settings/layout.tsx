import { Link, usePage } from '@inertiajs/react';
import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
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
        {
            title: t('settings_nav.editor_preferences', 'Editor preferences'),
            href: editEditorPreferences(),
        },
        {
            title: t('settings_nav.task_filters', 'Task filters'),
            href: '/settings/task-filters',
        },
        ...(isAdmin
            ? [
                  {
                      title: t('settings_nav.operations', 'Operations'),
                      href: '/settings/admin/operations',
                  },
              ]
            : []),
    ];

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

            <div className="flex flex-col lg:flex-row lg:space-x-12">
                <aside className="w-full max-w-xl lg:w-56">
                    <nav className="flex flex-col gap-4" aria-label={t('settings.title', 'Settings')}>
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

                        <div className="space-y-1">
                            <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                {t('settings.workspaces_section', 'Workspaces')}
                            </p>

                            {ownerWorkspaces.active.map((workspace) => {
                                const workspacePath = `/settings/workspaces/${workspace.id}`;
                                const isCurrentWorkspace = currentPath === workspacePath;

                                const sectionHref = (section: 'general' | 'members' | 'calendars' | 'advanced') =>
                                    `${workspacePath}?section=${section}`;

                                return (
                                    <div key={workspace.id} className="space-y-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            asChild
                                            className={cn('w-full justify-start px-2', {
                                                'bg-muted': isCurrentWorkspace,
                                            })}
                                        >
                                            <Link href={workspacePath} className="w-full min-w-0">
                                                <span className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
                                                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                                                    {workspace.is_personal ? (
                                                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground uppercase">
                                                            {t('settings.personal_workspace', 'Personal')}
                                                        </span>
                                                    ) : null}
                                                    {currentWorkspace?.id === workspace.id ? (
                                                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground uppercase">
                                                            {t('settings.current_workspace', 'Current')}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </Link>
                                        </Button>

                                        {isCurrentWorkspace ? (
                                            <div className="mt-1 space-y-1.5 pl-6">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    asChild
                                                    className={cn('w-full justify-start px-2', {
                                                        'bg-muted': currentSection === 'general',
                                                    })}
                                                >
                                                    <Link href={sectionHref('general')} className="truncate">
                                                        <span className="truncate">
                                                            {t('workspace_settings.general', 'General')}
                                                        </span>
                                                    </Link>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    asChild
                                                    className={cn('w-full justify-start px-2', {
                                                        'bg-muted': currentSection === 'members',
                                                    })}
                                                >
                                                    <Link href={sectionHref('members')} className="truncate">
                                                        <span className="truncate">
                                                            {t('workspace_settings.members', 'Members')}
                                                        </span>
                                                    </Link>
                                                </Button>
                                                {workspace.is_personal ? (
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        asChild
                                                        className={cn('w-full justify-start px-2', {
                                                            'bg-muted': currentSection === 'calendars',
                                                        })}
                                                    >
                                                        <Link href={sectionHref('calendars')} className="truncate">
                                                            <span className="truncate">
                                                                {t('workspace_settings.calendars', 'Calendars')}
                                                            </span>
                                                        </Link>
                                                    </Button>
                                                ) : null}
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    asChild
                                                    className={cn('w-full justify-start px-2', {
                                                        'bg-muted': currentSection === 'advanced',
                                                    })}
                                                >
                                                    <Link href={sectionHref('advanced')} className="truncate">
                                                        <span className="truncate">
                                                            {t('workspace_settings.advanced', 'Advanced')}
                                                        </span>
                                                    </Link>
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}

                            {ownerWorkspaces.migrated.length > 0 ? (
                                <div className="pt-3">
                                    <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                        {t(
                                            'settings.migrated_workspaces_section',
                                            'Migrated workspaces',
                                        )}
                                    </p>
                                </div>
                            ) : null}

                            {ownerWorkspaces.migrated.map((workspace) => {
                                const workspacePath = `/settings/workspaces/${workspace.id}`;
                                const isCurrentWorkspace = currentPath === workspacePath;

                                const sectionHref = (section: 'general' | 'members' | 'calendars' | 'advanced') =>
                                    `${workspacePath}?section=${section}`;

                                return (
                                    <div key={workspace.id} className="space-y-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            asChild
                                            className={cn('w-full justify-start px-2', {
                                                'bg-muted': isCurrentWorkspace,
                                            })}
                                        >
                                            <Link href={workspacePath} className="w-full min-w-0">
                                                <span className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
                                                    <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                                                    {workspace.is_personal ? (
                                                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground uppercase">
                                                            {t('settings.personal_workspace', 'Personal')}
                                                        </span>
                                                    ) : null}
                                                    {currentWorkspace?.id === workspace.id ? (
                                                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground uppercase">
                                                            {t('settings.current_workspace', 'Current')}
                                                        </span>
                                                    ) : null}
                                                </span>
                                            </Link>
                                        </Button>

                                        {isCurrentWorkspace ? (
                                            <div className="mt-1 space-y-1.5 pl-6">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    asChild
                                                    className={cn('w-full justify-start px-2', {
                                                        'bg-muted': currentSection === 'general',
                                                    })}
                                                >
                                                    <Link href={sectionHref('general')} className="truncate">
                                                        <span className="truncate">
                                                            {t('workspace_settings.general', 'General')}
                                                        </span>
                                                    </Link>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    asChild
                                                    className={cn('w-full justify-start px-2', {
                                                        'bg-muted': currentSection === 'members',
                                                    })}
                                                >
                                                    <Link href={sectionHref('members')} className="truncate">
                                                        <span className="truncate">
                                                            {t('workspace_settings.members', 'Members')}
                                                        </span>
                                                    </Link>
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    asChild
                                                    className={cn('w-full justify-start px-2', {
                                                        'bg-muted': currentSection === 'advanced',
                                                    })}
                                                >
                                                    <Link href={sectionHref('advanced')} className="truncate">
                                                        <span className="truncate">
                                                            {t('workspace_settings.advanced', 'Advanced')}
                                                        </span>
                                                    </Link>
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
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
