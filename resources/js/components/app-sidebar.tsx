import { usePage } from '@inertiajs/react';
import {
    BookOpen,
    CheckCheck,
    NotebookTabs,
} from 'lucide-react';
import { getColorTextClass } from '@/components/color-swatch-picker';
import { getLucideIconComponent } from '@/components/icon-picker';
import { NavFooter } from '@/components/nav-footer';
import { NavJournalLinks } from '@/components/nav-journal-links';
import { NavMain } from '@/components/nav-main';
import { NavNotesTree } from '@/components/nav-notes-tree';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
} from '@/components/ui/sidebar';
import { WorkspaceSwitcher } from '@/components/workspace-switcher';
import type { NavItem } from '@/types';

const footerNavItems: NavItem[] = [
    {
        title: 'Documentation',
        href: '/docs',
        icon: BookOpen,
        external: false,
        prefetch: true,
    },
];

export function AppSidebar() {
    const pageProps = usePage().props as {
        auth?: {
            user?: {
                settings?: {
                    editor?: {
                        sidebar_icons?: {
                            notes?: string;
                            tasks?: string;
                        };
                        sidebar_icon_colors?: {
                            notes?: string;
                            tasks?: string;
                        };
                    };
                };
            };
        };
    };

    const NotesIcon = getLucideIconComponent(
        pageProps.auth?.user?.settings?.editor?.sidebar_icons?.notes ?? null,
        NotebookTabs,
    );
    const TasksIcon = getLucideIconComponent(
        pageProps.auth?.user?.settings?.editor?.sidebar_icons?.tasks ?? null,
        CheckCheck,
    );
    const notesColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.sidebar_icon_colors?.notes ??
            'default',
    );
    const tasksColorClass = getColorTextClass(
        pageProps.auth?.user?.settings?.editor?.sidebar_icon_colors?.tasks ??
            'default',
    );

    const mainNavItems: NavItem[] = [
        {
            title: 'Notes',
            href: '/notes/list',
            icon: NotesIcon,
            iconClassName: notesColorClass,
            prefetch: false,
        },
        {
            title: 'Tasks',
            href: '/tasks',
            icon: TasksIcon,
            iconClassName: tasksColorClass,
            prefetch: false,
        },
    ];

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <WorkspaceSwitcher />
            </SidebarHeader>

            <SidebarContent className="group-data-[collapsible=icon]:pt-3">
                <NavMain items={mainNavItems} />
                <NavJournalLinks />
                <NavNotesTree />
            </SidebarContent>

            <SidebarFooter>
                <NavFooter items={footerNavItems} className="mt-auto" />
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
