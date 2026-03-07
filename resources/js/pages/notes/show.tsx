import { Head } from '@inertiajs/react';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Note',
        href: dashboard(),
    },
];

type Props = {
    content: string;
    noteId: string;
    properties: any;
};

export default function Dashboard({ content, noteId, properties }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Note" />
            <SimpleEditor
                id={noteId}
                content={content}
                properties={properties}
            />
        </AppLayout>
    );
}
