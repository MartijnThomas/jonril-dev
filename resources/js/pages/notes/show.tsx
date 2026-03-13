import { Head } from '@inertiajs/react';
import { useCallback, useState } from 'react';
import { StatusBarTaskCounter } from '@/components/status-bar-task-counter';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, EditorSaveStatus } from '@/types';

type Props = {
    content: string;
    noteId: string;
    noteUpdateUrl: string;
    properties: any;
    linkableNotes: { id: string; title: string; path?: string; href?: string }[];
    breadcrumbs: BreadcrumbItem[];
    language: 'nl' | 'en';
    noteType: string | null;
    journalGranularity: string | null;
    journalDate: string | null;
    defaultTimeblockDurationMinutes: number;
    editorMode: 'legacy' | 'block';
    workspaceSuggestions: {
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
                | 'deadline_date_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
        }[];
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
                | 'deadline_date_token';
            text?: string;
            label?: string;
            note_id?: string | null;
            href?: string | null;
            date?: string;
        }[];
        note: {
            id: string;
            title: string;
            href: string;
        };
        href: string;
    }[];
};

export default function Dashboard({
    content,
    noteId,
    noteUpdateUrl,
    properties,
    linkableNotes,
    breadcrumbs,
    language,
    noteType,
    journalGranularity,
    journalDate,
    defaultTimeblockDurationMinutes,
    editorMode,
    workspaceSuggestions,
    relatedTasks = [],
    backlinks = [],
}: Props) {
    const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>('ready');
    const [saveLastSavedAt, setSaveLastSavedAt] = useState<number | null>(null);
    const [contentStats, setContentStats] = useState<{
        words: number;
        characters: number;
        tasksTotal: number;
        tasksClosed: number;
        tasksCompleted: number;
        tasksCanceled: number;
        tasksMigrated: number;
        tasksOpen: number;
    }>({
        words: 0,
        characters: 0,
        tasksTotal: 0,
        tasksClosed: 0,
        tasksCompleted: 0,
        tasksCanceled: 0,
        tasksMigrated: 0,
        tasksOpen: 0,
    });
    const pageTitle = breadcrumbs.at(-1)?.title ?? 'Note';
    const handleContentStatsChange = useCallback((next: typeof contentStats) => {
        setContentStats((current) => {
            if (
                current.words === next.words &&
                current.characters === next.characters &&
                current.tasksTotal === next.tasksTotal &&
                current.tasksClosed === next.tasksClosed &&
                current.tasksCompleted === next.tasksCompleted &&
                current.tasksCanceled === next.tasksCanceled &&
                current.tasksMigrated === next.tasksMigrated &&
                current.tasksOpen === next.tasksOpen
            ) {
                return current;
            }

            return next;
        });
    }, []);

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            saveStatus={saveStatus}
            saveLastSavedAt={saveLastSavedAt}
            statusBarContent={
                <div className="flex w-full items-center gap-3">
                    <div className="flex items-center gap-3">
                        <span>Words {contentStats.words}</span>
                        <span>Chars {contentStats.characters}</span>
                        <StatusBarTaskCounter
                            stats={{
                                total: contentStats.tasksTotal,
                                closed: contentStats.tasksClosed,
                                open: contentStats.tasksOpen,
                                canceled: contentStats.tasksCanceled,
                                migrated: contentStats.tasksMigrated,
                                completed: contentStats.tasksCompleted,
                            }}
                        />
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        {editorMode === 'block' ? (
                            <span className="text-[11px] font-bold tracking-[0.16em] uppercase text-foreground/80">
                                BLOCK MODE
                            </span>
                        ) : null}
                    </div>
                </div>
            }
        >
            <Head title={pageTitle} />
            <SimpleEditor
                id={noteId}
                noteUpdateUrl={noteUpdateUrl}
                content={content}
                properties={properties}
                linkableNotes={linkableNotes}
                workspaceSuggestions={workspaceSuggestions}
                relatedTasks={relatedTasks}
                backlinks={backlinks}
                showRelatedPanel={
                    noteType !== 'journal' ||
                    (noteType === 'journal' && journalGranularity === 'daily')
                }
                language={language}
                noteType={noteType}
                journalGranularity={journalGranularity}
                journalDate={journalDate}
                defaultTimeblockDurationMinutes={defaultTimeblockDurationMinutes}
                editorMode={editorMode}
                onSaveStatusChange={setSaveStatus}
                onLastSavedAtChange={setSaveLastSavedAt}
                onContentStatsChange={handleContentStatsChange}
            />
        </AppLayout>
    );
}
