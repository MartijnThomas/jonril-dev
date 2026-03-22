import type { InertiaLinkProps } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';

export type BreadcrumbItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
};

export type NavItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
    icon?: LucideIcon | null;
    iconClassName?: string;
    isActive?: boolean;
    prefetch?: boolean;
    external?: boolean;
};

export type SidebarNoteTreeItem = {
    id: string;
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
    icon?: string | null;
    icon_color?: string | null;
    icon_bg?: string | null;
    has_children?: boolean;
    children: SidebarNoteTreeItem[];
};
