import { Head, usePage } from '@inertiajs/react';
import { useState } from 'react';
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
};

export default function Dashboard({
    content,
    noteId,
    noteUpdateUrl,
    properties,
    linkableNotes,
    breadcrumbs,
}: Props) {
    const page = usePage();
    const isAdmin = page.props.auth?.user?.role === 'admin';
    const [saveStatus, setSaveStatus] = useState<EditorSaveStatus>('ready');
    const [editorJson, setEditorJson] = useState<string>('');
    const [jsonOpen, setJsonOpen] = useState(false);
    const pageTitle = breadcrumbs.at(-1)?.title ?? 'Note';

    return (
        <AppLayout
            breadcrumbs={breadcrumbs}
            saveStatus={saveStatus}
            statusBarContent={
                isAdmin ? (
                    <button
                        type="button"
                        className="hover:text-foreground transition-colors"
                        onClick={() => setJsonOpen((value) => !value)}
                    >
                        JSON
                    </button>
                ) : null
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
                onSaveStatusChange={setSaveStatus}
                onDebugJsonChange={isAdmin ? setEditorJson : undefined}
            />
        </AppLayout>
    );
}
