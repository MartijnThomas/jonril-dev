import { Head, usePage } from '@inertiajs/react';
import { useState } from 'react';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
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
                        onClick={() => setJsonOpen(true)}
                    >
                        JSON
                    </button>
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
            {isAdmin && (
                <Sheet open={jsonOpen} onOpenChange={setJsonOpen}>
                    <SheetContent
                        side="bottom"
                        className="h-[45vh] max-h-[45vh] overflow-hidden p-0"
                    >
                        <SheetHeader>
                            <SheetTitle>Editor JSON</SheetTitle>
                        </SheetHeader>
                        <div className="h-full overflow-auto px-4 pb-4">
                            <pre className="text-xs leading-5 break-words whitespace-pre-wrap">
                                <code>{editorJson}</code>
                            </pre>
                        </div>
                    </SheetContent>
                </Sheet>
            )}
        </AppLayout>
    );
}
