import { Head, router } from '@inertiajs/react';
import { useCallback, useEffect, useState } from 'react';
import { StatusBarTaskCounter } from '@/components/status-bar-task-counter';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem, EditorSaveStatus } from '@/types';

type Props = {
    content: string;
    contentHash: string | null;
    noteId: string;
    noteUpdateUrl: string;
    noteHashUrl: string;
    noteImageUploadUrl: string;
    properties: any;
    linkableNotes: {
        id: string;
        title: string;
        path?: string;
        editablePath?: string;
        href?: string;
        headings?: { id: string; title: string; level: number | null }[];
    }[];
    breadcrumbs: BreadcrumbItem[];
    language: 'nl' | 'en';
    noteType: string | null;
    journalGranularity: string | null;
    journalDate: string | null;
    defaultTimeblockDurationMinutes: number;
    editorMode: 'legacy' | 'block';
    editorReadOnly?: boolean;
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
    meetingChildren?: { id: string; title: string; href: string; starts_at?: string | null }[];
    meetingEvent?: { starts_at: string | null; ends_at: string | null; timezone: string | null; location: string | null } | null;
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
    contentHash,
    noteId,
    noteUpdateUrl,
    noteHashUrl,
    noteImageUploadUrl,
    properties,
    linkableNotes,
    breadcrumbs,
    language,
    noteType,
    journalGranularity,
    journalDate,
    defaultTimeblockDurationMinutes,
    editorMode,
    editorReadOnly = false,
    workspaceSuggestions,
    relatedTasks = [],
    backlinks = [],
    meetingChildren = [],
    meetingEvent = null,
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
        indent: number;
        position: number;
        kind: string;
    }>({
        words: 0,
        characters: 0,
        tasksTotal: 0,
        tasksClosed: 0,
        tasksCompleted: 0,
        tasksCanceled: 0,
        tasksMigrated: 0,
        tasksOpen: 0,
        indent: 0,
        position: 0,
        kind: 'paragraph',
    });
    useEffect(() => {
        const handler = () => router.reload({ only: ['meetingChildren'] });
        window.addEventListener('sarth:note-saved', handler);
        return () => window.removeEventListener('sarth:note-saved', handler);
    }, []);

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
                current.tasksOpen === next.tasksOpen &&
                current.indent === next.indent &&
                current.position === next.position &&
                current.kind === next.kind
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
                <div className="flex w-full min-w-0 items-center gap-3 overflow-hidden">
                    <div className="flex min-w-0 items-center gap-3 overflow-hidden">
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
                        <span className="truncate">
                            Indent {contentStats.indent} | Position {contentStats.position} | Kind {contentStats.kind}
                        </span>
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
                noteHashUrl={noteHashUrl}
                noteImageUploadUrl={noteImageUploadUrl}
                contentHash={contentHash}
                content={content}
                properties={properties}
                linkableNotes={linkableNotes}
                workspaceSuggestions={workspaceSuggestions}
                relatedTasks={relatedTasks}
                backlinks={backlinks}
                meetingChildren={meetingChildren}
                meetingEvent={meetingEvent}
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
                readOnly={editorReadOnly}
                onSaveStatusChange={setSaveStatus}
                onLastSavedAtChange={setSaveLastSavedAt}
                onContentStatsChange={handleContentStatsChange}
            />
        </AppLayout>
    );
}
