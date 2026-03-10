<?php

namespace App\Support\Docs;

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
                $section = Str::of($slug)->contains('/')
                    ? Str::of($slug)->beforeLast('/')->replace('/', ' ')->title()->toString()
                    : 'General';

                return [
                    'slug' => $slug,
                    'title' => $this->extractTitle(File::get($file->getPathname()), $slug),
                    'href' => $slug === 'index' ? '/docs' : '/docs/'.$slug,
                    'section' => $section,
                ];
            })
            ->sortBy(fn (array $page): string => sprintf(
                '%s-%s-%s-%s',
                $page['section'] === 'General' ? '0' : '1',
                $page['section'],
                $page['slug'] === 'index' ? '0' : '1',
                $page['slug'],
            ))
            ->values();
    }

    /**
     * @return array{slug: string, title: string, markdown: string, html: string}|null
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

        return [
            'slug' => $normalizedSlug,
            'title' => $this->extractTitle($markdown, $normalizedSlug),
            'markdown' => $markdown,
            'html' => (string) Str::markdown($markdown),
        ];
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
