import { Head, Link } from '@inertiajs/react';
import AppLayout from '@/layouts/app-layout';
import type { BreadcrumbItem } from '@/types';

type DocsPage = {
    slug: string;
    title: string;
    html: string;
    tocHtml?: string | null;
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

            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_14rem]">
                    <aside className="md:sticky md:top-4 md:self-start">
                        <div className="space-y-5">
                            {Object.entries(pagesBySection).map(([section, items]) => (
                                <div key={section}>
                                    <h2 className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
                                        <span>{section}</span>
                                        {section === 'Development' ? (
                                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.62rem] leading-none font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                                                Admin
                                            </span>
                                        ) : null}
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
                        className="space-y-4 [&_.docs-heading-anchor]:ml-2 [&_.docs-heading-anchor]:inline-block [&_.docs-heading-anchor]:text-zinc-400 [&_.docs-heading-anchor]:no-underline [&_.docs-heading-anchor]:opacity-0 [&_.docs-heading-anchor]:transition-opacity [&_.docs-heading-anchor:hover]:text-zinc-500 dark:[&_.docs-heading-anchor]:text-zinc-500 dark:[&_.docs-heading-anchor:hover]:text-zinc-300 [&_.docs-heading-anchor:focus-visible]:opacity-100 [&_a]:underline [&_a]:underline-offset-4 [&_blockquote]:border-l [&_blockquote]:pl-4 [&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:scroll-mt-24 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1:hover_.docs-heading-anchor]:opacity-100 [&_h2]:mt-8 [&_h2]:scroll-mt-24 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2:hover_.docs-heading-anchor]:opacity-100 [&_h3]:mt-6 [&_h3]:scroll-mt-24 [&_h3]:text-xl [&_h3]:font-semibold [&_h3:hover_.docs-heading-anchor]:opacity-100 [&_h4]:scroll-mt-24 [&_h4:hover_.docs-heading-anchor]:opacity-100 [&_h5]:scroll-mt-24 [&_h5:hover_.docs-heading-anchor]:opacity-100 [&_h6]:scroll-mt-24 [&_h6:hover_.docs-heading-anchor]:opacity-100 [&_hr]:my-6 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:leading-7 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted/60 [&_pre]:p-4 [&_ul]:list-disc [&_ul]:pl-6"
                        dangerouslySetInnerHTML={{ __html: page.html }}
                    />

                    {page.tocHtml ? (
                        <aside className="hidden xl:sticky xl:top-4 xl:block xl:self-start">
                            <div className="rounded-md border border-sidebar-border/60 bg-background/70 p-3">
                                <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                    On This Page
                                </h2>
                                <nav
                                    className="text-sm text-muted-foreground [&_.docs-toc]:space-y-1 [&_.docs-toc]:pl-0 [&_.docs-toc_a]:block [&_.docs-toc_a]:rounded-sm [&_.docs-toc_a]:px-2 [&_.docs-toc_a]:py-1 [&_.docs-toc_a:hover]:bg-accent/60 [&_.docs-toc_a:hover]:text-foreground [&_.docs-toc_li]:my-0 [&_.docs-toc_li]:list-none [&_.docs-toc_ul]:mt-1 [&_.docs-toc_ul]:space-y-1 [&_.docs-toc_ul]:pl-3"
                                    dangerouslySetInnerHTML={{ __html: page.tocHtml }}
                                />
                            </div>
                        </aside>
                    ) : null}
                </div>
                </div>
            </div>
        </AppLayout>
    );
}
