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
                timeblock_color?: string | null;
                icon: string;
                role: string;
                is_migrated_source?: boolean;
            }>;
            currentWorkspace: {
                id: string;
                name: string;
                slug: string;
                color: string;
                timeblock_color?: string | null;
                icon: string;
                role: string;
                is_migrated_source?: boolean;
                note_counts?: {
                    total: number;
                    normal: number;
                    journal: number;
                };
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
            todayEvents?: Array<{
                id: string;
                block_id: string | null;
                type: 'timeblock' | 'event';
                title: string;
                note_id: string | null;
                starts_at: string | null;
                ends_at: string | null;
                timezone?: string | null;
                location: string | null;
                task_block_id: string | null;
                task_checked: boolean | null;
                task_status: string | null;
                note_title: string | null;
                href: string | null;
                meeting_note_id: string | null;
                meeting_note_href: string | null;
            }>;
            todayEventsDate?: string | null;
            workspaceLinkableNotes?: Array<{
                id: string;
                title: string;
                path: string | null;
            }>;
            workspaceMeetingParentOptions?: Array<{
                id: string;
                title: string;
                path: string | null;
                is_journal: boolean;
            }>;
            [key: string]: unknown;
        };
    }
}
