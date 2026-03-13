<?php

namespace App\Support\Docs;

use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\GithubFlavoredMarkdownExtension;
use League\CommonMark\Extension\HeadingPermalink\HeadingPermalinkExtension;
use League\CommonMark\Extension\TableOfContents\TableOfContentsExtension;
use League\CommonMark\MarkdownConverter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class DocumentationRepository
{
    public function resolveLocale(?string $requestedLocale): string
    {
        $candidate = is_string($requestedLocale)
            ? Str::of($requestedLocale)->lower()->trim()->toString()
            : '';

        if ($candidate !== '' && File::isDirectory($this->localePath($candidate))) {
            return $candidate;
        }

        return 'en';
    }

    /**
     * @return Collection<int, array{slug: string, title: string, href: string, section: string}>
     */
    public function listPages(string $locale): Collection
    {
        $root = $this->localePath($locale);
        if (! File::isDirectory($root)) {
            return collect();
        }

        return collect(File::allFiles($root))
            ->filter(fn (\SplFileInfo $file): bool => $file->getExtension() === 'md')
            ->map(function (\SplFileInfo $file) use ($root): array {
                $relative = Str::of($file->getPathname())
                    ->after($root.DIRECTORY_SEPARATOR)
                    ->replace('\\', '/')
                    ->toString();

                $slug = Str::of($relative)->beforeLast('.md')->toString();
                $sectionKey = Str::of($slug)->contains('/')
                    ? Str::of($slug)->beforeLast('/')->replace('/', ' ')->lower()->trim()->toString()
                    : 'general';
                $section = $sectionKey === 'general'
                    ? 'General'
                    : Str::of($sectionKey)->title()->toString();

                return [
                    'slug' => $slug,
                    'title' => $this->extractTitle(File::get($file->getPathname()), $slug),
                    'href' => $slug === 'index' ? '/docs' : '/docs/'.$slug,
                    'section' => $section,
                    'section_key' => $sectionKey,
                ];
            })
            ->sortBy(fn (array $page): string => sprintf(
                '%s-%s-%s-%s',
                $this->sectionSortWeight($page['section_key'] ?? ''),
                $page['section_key'] ?? '',
                $page['slug'] === 'index' ? '0' : '1',
                $page['slug'],
            ))
            ->map(fn (array $page): array => [
                'slug' => $page['slug'],
                'title' => $page['title'],
                'href' => $page['href'],
                'section' => $page['section'],
            ])
            ->values();
    }

    /**
     * @return array{slug: string, title: string, markdown: string, html: string, toc_html: string|null}|null
     */
    public function findPage(string $slug, string $locale): ?array
    {
        $normalizedSlug = $this->normalizeSlug($slug);
        if (str_contains($normalizedSlug, '..')) {
            return null;
        }

        $path = $this->localePath($locale).DIRECTORY_SEPARATOR.$normalizedSlug.'.md';
        if (! File::exists($path)) {
            return null;
        }

        $markdown = File::get($path);

        $rendered = $this->renderMarkdown($markdown);

        return [
            'slug' => $normalizedSlug,
            'title' => $this->extractTitle($markdown, $normalizedSlug),
            'markdown' => $markdown,
            'html' => $rendered['html'],
            'toc_html' => $rendered['toc_html'],
        ];
    }

    /**
     * @return array{html: string, toc_html: string|null}
     */
    private function renderMarkdown(string $markdown): array
    {
        $environment = new Environment([
            'heading_permalink' => [
                'insert' => 'after',
                'apply_id_to_heading' => true,
                'id_prefix' => 'doc',
                'fragment_prefix' => 'doc',
                'min_heading_level' => 1,
                'max_heading_level' => 6,
                'symbol' => '#',
                'html_class' => 'docs-heading-anchor',
            ],
            'table_of_contents' => [
                'position' => 'top',
                'style' => 'bullet',
                'normalize' => 'relative',
                'min_heading_level' => 2,
                'max_heading_level' => 4,
                'html_class' => 'docs-toc',
            ],
        ]);
        $environment->addExtension(new CommonMarkCoreExtension());
        $environment->addExtension(new GithubFlavoredMarkdownExtension());
        $environment->addExtension(new HeadingPermalinkExtension());
        $environment->addExtension(new TableOfContentsExtension());

        $converter = new MarkdownConverter($environment);
        $html = (string) $converter->convert($markdown);

        return $this->extractTableOfContents($html);
    }

    /**
     * @return array{html: string, toc_html: string|null}
     */
    private function extractTableOfContents(string $html): array
    {
        $dom = new \DOMDocument();
        $previousState = libxml_use_internal_errors(true);
        $loaded = $dom->loadHTML(
            '<?xml encoding="utf-8" ?>'.$html,
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD,
        );

        if ($loaded === false) {
            libxml_clear_errors();
            libxml_use_internal_errors($previousState);

            return [
                'html' => $html,
                'toc_html' => null,
            ];
        }

        $xpath = new \DOMXPath($dom);
        $tocNode = $xpath->query(
            "//*[contains(concat(' ', normalize-space(@class), ' '), ' docs-toc ')]",
        )?->item(0);

        if (! $tocNode instanceof \DOMNode) {
            libxml_clear_errors();
            libxml_use_internal_errors($previousState);

            return [
                'html' => trim((string) $dom->saveHTML()),
                'toc_html' => null,
            ];
        }

        $tocHtml = trim((string) $dom->saveHTML($tocNode));
        $tocNode->parentNode?->removeChild($tocNode);

        libxml_clear_errors();
        libxml_use_internal_errors($previousState);

        return [
            'html' => trim((string) $dom->saveHTML()),
            'toc_html' => $tocHtml !== '' ? $tocHtml : null,
        ];
    }

    private function sectionSortWeight(string $sectionKey): string
    {
        return match (Str::lower(trim($sectionKey))) {
            'general' => '0',
            'development' => '2',
            default => '1',
        };
    }

    private function docsPath(): string
    {
        return base_path('docs');
    }

    private function localePath(string $locale): string
    {
        return $this->docsPath().DIRECTORY_SEPARATOR.$locale;
    }

    private function normalizeSlug(string $slug): string
    {
        $trimmed = trim(str_replace('\\', '/', $slug), '/');

        return $trimmed === '' ? 'index' : $trimmed;
    }

    private function extractTitle(string $markdown, string $slug): string
    {
        if (preg_match('/^\s*#\s+(.+)$/m', $markdown, $matches) === 1) {
            return trim($matches[1]);
        }

        return Str::of($slug)
            ->afterLast('/')
            ->replace(['-', '_'], ' ')
            ->title()
            ->toString();
    }
}
