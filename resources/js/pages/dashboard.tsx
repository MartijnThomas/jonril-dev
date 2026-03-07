import { Head } from '@inertiajs/react';
import { SimpleEditor } from '@/components/tiptap-templates/simple/simple-editor';
import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: dashboard(),
    },
];

type Props = {
    content: string;
};

export default function Dashboard({ content }: Props) {
    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <SimpleEditor content={content} />
        </AppLayout>
    );
}