<?php

namespace App\Http\Controllers;

use App\Support\Docs\DocumentationRepository;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class DocumentationController extends Controller
{
    public function __construct(
        private readonly DocumentationRepository $documentationRepository,
    ) {}

    public function index(Request $request): Response
    {
        return $this->show($request, 'index');
    }

    public function show(Request $request, ?string $slug = null): Response
    {
        $isAdmin = $request->user()?->role === 'admin';
        $language = $request->user()?->settings['language'] ?? null;
        $locale = $this->documentationRepository->resolveLocale(
            is_string($language) ? $language : null,
        );

        $resolvedSlug = is_string($slug) && trim($slug) !== ''
            ? trim($slug)
            : 'index';
        $isDevelopmentPage = Str::startsWith($resolvedSlug, 'development/');

        abort_if(! $isAdmin && $isDevelopmentPage, 404);

        $page = $this->documentationRepository->findPage($resolvedSlug, $locale);
        abort_if($page === null, 404);

        $pages = $this->documentationRepository
            ->listPages($locale)
            ->reject(function (array $item) use ($isAdmin): bool {
                if ($isAdmin) {
                    return false;
                }

                return Str::startsWith($item['slug'], 'development/');
            })
            ->map(fn (array $item): array => [
                ...$item,
                'current' => $item['slug'] === $page['slug'],
            ])
            ->values();

        return Inertia::render('docs/show', [
            'locale' => $locale,
            'page' => [
                'slug' => $page['slug'],
                'title' => $page['title'],
                'html' => $page['html'],
                'tocHtml' => $page['toc_html'],
            ],
            'pages' => $pages,
        ]);
    }
}
