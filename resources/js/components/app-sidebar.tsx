import { format } from 'date-fns';
import {
    BookOpen,
    CalendarDays,
    FolderGit2,
    ListChecks,
    Settings,
} from 'lucide-react';
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

const mainNavItems: NavItem[] = [
    {
        title: 'Tasks',
        href: '/tasks',
        icon: ListChecks,
        prefetch: false,
    },
];

const footerNavItems: NavItem[] = [
    {
        title: 'Documentation',
        href: 'https://laravel.com/docs/starter-kits#react',
        icon: BookOpen,
        external: true,
    },
];

export function AppSidebar() {
    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <WorkspaceSwitcher />
            </SidebarHeader>

            <SidebarContent>
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
