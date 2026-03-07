import type { Auth } from '@/types/auth';
import type { SidebarNoteTreeItem } from '@/types/navigation';

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            auth: Auth;
            notesTree: SidebarNoteTreeItem[];
            sidebarOpen: boolean;
            [key: string]: unknown;
        };
    }
}
