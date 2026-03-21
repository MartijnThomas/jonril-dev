import { Head, router, usePage } from '@inertiajs/react';
import { parseISO } from 'date-fns';
import { enUS, nl } from 'date-fns/locale';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import AppLayout from '@/layouts/app-layout';
import {
    formatClockTime,
    formatLongDate,
    resolveLongDateFormat,
    resolveTimeFormat,
} from '@/lib/user-date-time-format';
import type { AppLanguage } from '@/lib/user-date-time-format';
import type { BreadcrumbItem } from '@/types';

type Revision = {
    id: string;
    title: string | null;
    created_at: string;
};

type Props = {
    noteId: string;
    noteTitle: string;
    noteUrl: string;
    isCurrentVersion: boolean;
    currentRevisionId: string | null;
    content: unknown;
    editorMode: 'legacy' | 'block';
    language: AppLanguage;
    breadcrumbs: BreadcrumbItem[];
    revisions: Revision[];
};

export default function NoteRevisions({
    noteId,
    noteTitle,
    noteUrl,
    isCurrentVersion,
    currentRevisionId,
    content,
    editorMode,
    language,
    breadcrumbs,
    revisions,
}: Props) {
    const [restoring, setRestoring] = useState(false);
    const pageProps = usePage().props as { auth?: { user?: { settings?: Record<string, unknown> } } };
    const userSettings = pageProps.auth?.user?.settings ?? {};

    const longDateFormat = resolveLongDateFormat(userSettings.date_long_format, language);
    const timeFormat = resolveTimeFormat(userSettings.time_format, language);
    const locale = language === 'en' ? enUS : nl;

    const formatRevisionTimestamp = (isoString: string): string => {
        const date = parseISO(isoString);
        return `${formatLongDate(date, locale, longDateFormat)}, ${formatClockTime(date, timeFormat)}`;
    };

    const currentRevision = revisions.find((r) => r.id === currentRevisionId) ?? null;

    const navigateToCurrent = () => {
        router.visit(`/notes/${noteId}/history`);
    };

    const navigateTo = (revisionId: string) => {
        router.visit(`/notes/${noteId}/history/${revisionId}`);
    };

    const restore = () => {
        if (!currentRevisionId || restoring) return;
        setRestoring(true);
        router.post(
            `/notes/${noteId}/history/${currentRevisionId}/restore`,
            {},
            {
                onSuccess: () => {
                    toast.success('Version restored successfully.');
                    setRestoring(false);
                },
                onError: () => setRestoring(false),
            },
        );
    };

    const editorKey = isCurrentVersion ? 'current' : (currentRevisionId ?? 'empty');

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`History — ${noteTitle}`} />

            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Revision timeline sidebar */}
                <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r min-h-0">
                    {/* Current version (live note) */}
                    <div className="p-2">
                        <button
                            type="button"
                            onClick={navigateToCurrent}
                            className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted ${
                                isCurrentVersion ? 'bg-muted' : ''
                            }`}
                        >
                            <span className="text-xs font-semibold">Current version</span>
                            <span className="text-[0.7rem] text-muted-foreground">Live content</span>
                        </button>
                    </div>

                    <Separator />

                    {/* Saved revisions */}
                    <div className="flex flex-col gap-px p-2">
                        {revisions.length === 0 ? (
                            <p className="px-2 py-3 text-xs text-muted-foreground">
                                No revisions saved yet.
                            </p>
                        ) : null}
                        {revisions.map((revision) => {
                            const isActive = !isCurrentVersion && revision.id === currentRevisionId;
                            return (
                                <button
                                    key={revision.id}
                                    type="button"
                                    onClick={() => navigateTo(revision.id)}
                                    className={`flex flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted ${
                                        isActive ? 'bg-muted' : ''
                                    }`}
                                >
                                    <span className="text-[0.72rem] leading-snug text-foreground">
                                        {formatRevisionTimestamp(revision.created_at)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* Main content area */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    {/* Toolbar */}
                    <div className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
                        <Button
                            size="sm"
                            variant="outline"
                            className="md:hidden"
                            onClick={() => router.visit(noteUrl)}
                        >
                            <ArrowLeft className="mr-1.5 size-3.5" />
                            Back to note
                        </Button>
                        <span className="text-sm text-muted-foreground">
                            {isCurrentVersion
                                ? 'Current version'
                                : currentRevision
                                  ? formatRevisionTimestamp(currentRevision.created_at)
                                  : 'Saved revision'}
                        </span>
                        {!isCurrentVersion && currentRevisionId && (
                            <Button
                                size="sm"
                                variant="outline"
                                className="ml-auto"
                                onClick={restore}
                                disabled={restoring}
                            >
                                <RotateCcw className="mr-1.5 size-3.5" />
                                Restore this version
                            </Button>
                        )}
                    </div>

                    {/* Read-only editor */}
                    {content != null ? (
                        <SimpleEditor
                            id={`revision-${editorKey}`}
                            noteUpdateUrl=""
                            content={content as string}
                            properties={{}}
                            linkableNotes={[]}
                            workspaceSuggestions={{ mentions: [], hashtags: [] }}
                            relatedTasks={[]}
                            backlinks={[]}
                            meetingChildren={[]}
                            meetingEvent={null}
                            showRelatedPanel={false}
                            language={language}
                            noteType="note"
                            journalGranularity={null}
                            journalDate={null}
                            defaultTimeblockDurationMinutes={60}
                            editorMode={editorMode}
                            readOnly={true}
                            onSaveStatusChange={() => {}}
                            onLastSavedAtChange={() => {}}
                            onContentStatsChange={() => {}}
                        />
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                            No content available.
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
