import { Head, usePage } from '@inertiajs/react';
import { useState } from 'react';
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
    workspaceSuggestions: {
        mentions: string[];
        hashtags: string[];
    };
    relatedTasks: {
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
    backlinks: {
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
    workspaceSuggestions,
    relatedTasks,
    backlinks,
}: Props) {
    const page = usePage();
    const isAdmin = page.props.auth?.user?.role === 'admin';
    const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>('ready');
    const [saveLastSavedAt, setSaveLastSavedAt] = useState<number | null>(null);
    const [editorJson, setEditorJson] = useState<string>('');
    const [jsonOpen, setJsonOpen] = useState(false);
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
                    {isAdmin ? (
                        <button
                            type="button"
                            className="ml-auto hover:text-foreground transition-colors"
                            onClick={() => setJsonOpen((value) => !value)}
                        >
                            JSON
                        </button>
                    ) : null}
                </div>
            }
            bottomPane={
                isAdmin && jsonOpen ? (
                    <section className="border-t border-sidebar-border/50 bg-background/95">
                        <div className="h-[33svh] overflow-auto px-4 py-3">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">
                                Editor JSON
                            </div>
                            <pre className="text-xs leading-5 break-words whitespace-pre-wrap">
                                <code>{editorJson}</code>
                            </pre>
                        </div>
                    </section>
                ) : null
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
                onSaveStatusChange={setSaveStatus}
                onLastSavedAtChange={setSaveLastSavedAt}
                onDebugJsonChange={isAdmin ? setEditorJson : undefined}
                onContentStatsChange={setContentStats}
            />
        </AppLayout>
    );
}
