import type { ReactNode } from 'react';
import type { BreadcrumbItem } from '@/types/navigation';

export type EditorSaveStatus = 'ready' | 'dirty' | 'saving' | 'error';

export type AppLayoutProps = {
    children: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    saveStatus?: EditorSaveStatus | null;
    saveLastSavedAt?: number | null;
    rightSidebar?: ReactNode;
    statusBarContent?: ReactNode;
    bottomPane?: ReactNode;
};

export type AuthLayoutProps = {
    children?: ReactNode;
    name?: string;
    title?: string;
    description?: string;
};
