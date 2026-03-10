import type { Auth } from '@/types/auth';
import type { SidebarNoteTreeItem } from '@/types/navigation';

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            workspaces: Array<{
                id: string;
                name: string;
                slug: string;
                color: string;
                icon: string;
                role: string;
            }>;
            currentWorkspace: {
                id: string;
                name: string;
                slug: string;
                color: string;
                icon: string;
                role: string;
            } | null;
            notesTree: SidebarNoteTreeItem[];
            noteSearchIndex: Array<{
                id: string;
                title: string;
                href: string;
                slug: string | null;
                path: string | null;
                type: string | null;
            }>;
            sidebarOpen: boolean;
            rightSidebarOpen: boolean;
            [key: string]: unknown;
        };
    }
}
