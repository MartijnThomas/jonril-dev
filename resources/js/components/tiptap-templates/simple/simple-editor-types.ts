import type { DocumentPropertiesValue } from '@/components/tiptap-properties/document-properties';
import type { EditorSaveStatus } from '@/types';

export type SimpleEditorContent = string | Record<string, any> | null;

export type SimpleEditorProps = {
    id?: string;
    noteUpdateUrl?: string;
    content?: SimpleEditorContent;
    properties?: DocumentPropertiesValue;
    linkableNotes?: {
        id: string;
        title: string;
        path?: string;
        href?: string;
        headings?: {
            id: string;
            title: string;
            level: number | null;
        }[];
    }[];
    workspaceSuggestions?: {
        mentions: string[];
        hashtags: string[];
    };
    relatedTasks?: {
        id: number;
        note_id: string;
        block_id: string | null;
        position: number;
        checked: boolean;
        content: string;
        render_fragments: {
            type:
                | 'text'
                | 'mention'
                | 'hashtag'
                | 'wikilink'
                | 'due_date_token'
                | 'deadline_date_token'
                | 'status_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
            value?: string;
            status?:
                | 'canceled'
                | 'assigned'
                | 'in_progress'
                | 'migrated'
                | 'deferred'
                | 'starred'
                | 'backlog'
                | null;
        }[];
        task_status?:
            | 'canceled'
            | 'assigned'
            | 'in_progress'
            | 'migrated'
            | 'deferred'
            | 'starred'
            | 'backlog'
            | null;
        due_date: string | null;
        deadline_date: string | null;
        note: {
            id: string;
            title: string;
            href: string;
        };
    }[];
    backlinks?: {
        id: string;
        block_id: string;
        excerpt: string;
        render_fragments: {
            type:
                | 'text'
                | 'mention'
                | 'hashtag'
                | 'wikilink'
                | 'due_date_token'
                | 'deadline_date_token'
                | 'status_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
            value?: string;
            status?:
                | 'canceled'
                | 'assigned'
                | 'in_progress'
                | 'migrated'
                | 'deferred'
                | 'starred'
                | 'backlog'
                | null;
        }[];
        note: {
            id: string;
            title: string;
            href: string;
        };
        href: string;
    }[];
    showRelatedPanel?: boolean;
    language?: 'nl' | 'en';
    noteType?: string | null;
    journalGranularity?: string | null;
    journalDate?: string | null;
    defaultTimeblockDurationMinutes?: number;
    editorMode?: 'legacy' | 'block';
    readOnly?: boolean;
    onSaveStatusChange?: (status: EditorSaveStatus) => void;
    onLastSavedAtChange?: (timestamp: number | null) => void;
    onDebugJsonChange?: (json: string) => void;
    onContentStatsChange?: (stats: {
        words: number;
        characters: number;
        tasksTotal: number;
        tasksClosed: number;
        tasksCompleted: number;
        tasksCanceled: number;
        tasksMigrated: number;
        tasksOpen: number;
        indent?: number;
        position?: number;
        kind?: string;
    }) => void;
};
