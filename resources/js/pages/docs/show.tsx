import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type DocsPage = {
    slug: string;
    title: string;
    html: string;
};

type DocsNavItem = {
    slug: string;
    title: string;
    href: string;
    section: string;
    current: boolean;
};

type Props = {
    locale: string;
    page: DocsPage;
    pages: DocsNavItem[];
};

export default function DocsShow({ page, pages }: Props) {
    const pagesBySection = pages.reduce<Record<string, DocsNavItem[]>>(
        (acc, item) => {
            if (!acc[item.section]) {
                acc[item.section] = [];
            }
            acc[item.section].push(item);
            return acc;
        },
        {},
    );

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Documentation', href: '/docs' },
        ...(page.slug === 'index'
            ? []
            : [{ title: page.title, href: `/docs/${page.slug}` }]),
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={`Docs - ${page.title}`} />

            <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-[16rem_minmax(0,1fr)]">
                    <aside className="md:sticky md:top-24 md:self-start">
                        <div className="space-y-5">
                            {Object.entries(pagesBySection).map(([section, items]) => (
                                <div key={section}>
                                    <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                                        {section}
                                    </h2>
                                    <nav className="space-y-1">
                                        {items.map((item) => (
                                            <Link
                                                key={item.slug}
                                                href={item.href}
                                                className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                                                    item.current
                                                        ? 'bg-accent text-accent-foreground font-medium'
                                                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                                                }`}
                                            >
                                                {item.title}
                                            </Link>
                                        ))}
                                    </nav>
                                </div>
                            ))}
                        </div>
                    </aside>

                    <article
                        className="space-y-4 [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-6 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted/60 [&_pre]:p-4 [&_ul]:list-disc [&_ul]:pl-6"
                        dangerouslySetInnerHTML={{ __html: page.html }}
                    />
                </div>
            </div>
        </AppLayout>
    );
}
