<?php

namespace App\Http\Middleware;

use App\Models\Note;
use App\Support\Notes\JournalNoteService;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'notesTree' => fn () => $this->buildNotesTree($request),
            'noteSearchIndex' => fn () => $this->buildNoteSearchIndex($request),
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'rightSidebarOpen' => ! $request->hasCookie('right_sidebar_state') || $request->cookie('right_sidebar_state') === 'true',
        ];
    }

    /**
     * @return array<int, array{id: string, title: string, href: string, parent_id: string|null, children: array}>
     */
    private function buildNotesTree(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }

        /** @var Collection<int, Note> $notes */
        $notes = Note::query()
            ->where('user_id', $user->id)
            ->where(function ($query) {
                $query->whereNull('type')
                    ->orWhere('type', '!=', 'journal');
            })
            ->orderBy('created_at')
            ->get(['id', 'slug', 'title', 'properties', 'parent_id', 'type']);

        $nodes = [];
        foreach ($notes as $note) {
            $nodes[$note->id] = [
                'id' => $note->id,
                'title' => $note->title ?? 'Untitled',
                'href' => '/notes/'.($note->slug ?: $note->id),
                'parent_id' => $note->parent_id,
                'children' => [],
            ];
        }

        $tree = [];

        foreach ($nodes as $id => $node) {
            $parentId = $node['parent_id'];
            if ($parentId && isset($nodes[$parentId])) {
                $nodes[$parentId]['children'][] = &$nodes[$id];
            } else {
                $tree[] = &$nodes[$id];
            }
        }

        $stripParent = function (array &$items) use (&$stripParent): void {
            foreach ($items as &$item) {
                unset($item['parent_id']);
                $stripParent($item['children']);
            }
        };

        $stripParent($tree);

        return $tree;
    }

    /**
     * @return array<int, array{id: string, title: string, href: string, slug: string|null, path: string|null, type: string|null}>
     */
    private function buildNoteSearchIndex(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }

        /** @var Collection<int, Note> $notes */
        $notes = Note::query()
            ->where('user_id', $user->id)
            ->orderBy('created_at')
            ->get([
                'id',
                'title',
                'slug',
                'parent_id',
                'type',
                'journal_granularity',
                'journal_date',
            ]);

        $noteById = $notes->keyBy('id');
        $pathById = [];

        $resolvePath = function (string $noteId) use (&$resolvePath, &$pathById, $noteById): string {
            if (isset($pathById[$noteId])) {
                return $pathById[$noteId];
            }

            /** @var Note|null $current */
            $current = $noteById->get($noteId);
            if (! $current) {
                return '';
            }

            $title = $current->title ?? 'Untitled';
            if (! $current->parent_id) {
                $pathById[$noteId] = $title;

                return $title;
            }

            $parentPath = $resolvePath($current->parent_id);
            $path = $parentPath !== '' ? "{$parentPath} / {$title}" : $title;
            $pathById[$noteId] = $path;

            return $path;
        };

        return $notes
            ->map(function (Note $note) use ($resolvePath) {
                $href = '/notes/'.($note->slug ?: $note->id);

                if ($note->type === Note::TYPE_JOURNAL && $note->journal_granularity && $note->journal_date) {
                    $period = app(JournalNoteService::class)->periodFor(
                        $note->journal_granularity,
                        $note->journal_date,
                    );
                    $href = "/journal/{$note->journal_granularity}/{$period}";
                }

                return [
                    'id' => $note->id,
                    'title' => $note->title ?? 'Untitled',
                    'href' => $href,
                    'slug' => $note->slug,
                    'path' => $note->parent_id ? $resolvePath($note->parent_id) : null,
                    'type' => $note->type,
                ];
            })
            ->values()
            ->all();
    }
}
