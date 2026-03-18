<?php

namespace App\Jobs;

use App\Models\Note;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

class WarmNoteSharedCacheJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $workspaceId,
    ) {
        $this->onQueue('indexing');
    }

    public function handle(NoteSlugService $noteSlugService): void
    {
        $workspace = Workspace::find($this->workspaceId);

        if (! $workspace) {
            return;
        }

        $this->warmNotesTree($workspace, $noteSlugService);
        $this->warmNoteCount($workspace);
        $this->warmLinkableNotes($workspace);
        $this->warmMeetingParentOptions($workspace);
    }

    private function warmNotesTree(Workspace $workspace, NoteSlugService $noteSlugService): void
    {
        $notes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where(function ($query) {
                $query->whereNull('type')
                    ->orWhere('type', Note::TYPE_NOTE);
            })
            ->orderBy('created_at')
            ->get(['id', 'workspace_id', 'slug', 'title', 'properties', 'parent_id', 'type']);

        $nodes = [];
        foreach ($notes as $note) {
            $nodes[$note->id] = [
                'id' => $note->id,
                'title' => $note->display_title,
                'href' => $noteSlugService->urlFor($note),
                'icon' => $note->icon,
                'icon_color' => $note->icon_color,
                'icon_bg' => $note->icon_bg,
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

        $sortTree = function (array &$items) use (&$sortTree): void {
            usort($items, function (array $a, array $b): int {
                $aHasChildren = count($a['children']) > 0;
                $bHasChildren = count($b['children']) > 0;

                if ($aHasChildren !== $bHasChildren) {
                    return $aHasChildren ? -1 : 1;
                }

                return strcasecmp((string) ($a['title'] ?? ''), (string) ($b['title'] ?? ''));
            });

            foreach ($items as &$item) {
                if (! empty($item['children'])) {
                    $sortTree($item['children']);
                }
            }
        };

        $sortTree($tree);

        $stripParent = function (array &$items) use (&$stripParent): void {
            foreach ($items as &$item) {
                unset($item['parent_id']);
                $stripParent($item['children']);
            }
        };

        $stripParent($tree);

        Cache::put("notes_tree_{$workspace->id}", $tree, now()->addDay());
    }

    private function warmNoteCount(Workspace $workspace): void
    {
        $totals = Note::query()
            ->where('workspace_id', $workspace->id)
            ->selectRaw(
                'count(*) as total, sum(case when type = ? then 1 else 0 end) as journal',
                [Note::TYPE_JOURNAL],
            )
            ->first();

        $total = (int) ($totals?->total ?? 0);
        $journal = (int) ($totals?->journal ?? 0);

        Cache::put("notes_count_{$workspace->id}", [
            'total' => $total,
            'normal' => max(0, $total - $journal),
            'journal' => $journal,
        ], now()->addDay());
    }

    private function warmLinkableNotes(Workspace $workspace): void
    {
        $meetingParentIds = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where('type', Note::TYPE_MEETING)
            ->whereNotNull('parent_id')
            ->pluck('parent_id')
            ->unique()
            ->all();

        $notes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('type', [Note::TYPE_NOTE, null])
            ->whereNotIn('id', $meetingParentIds)
            ->get(['id', 'title', 'parent_id', 'properties']);

        /** @var \Illuminate\Support\Collection<string, array{id: string, title: string, parent_id: string|null}> $byId */
        $byId = $notes->keyBy('id');

        $resolvePath = function (string $noteId) use ($byId): ?string {
            $segments = [];
            $visited = [];
            $cursor = $byId->get($noteId);

            while ($cursor !== null && ! isset($visited[$cursor['id']])) {
                $visited[$cursor['id']] = true;
                array_unshift($segments, $cursor['title'] ?? 'Untitled');

                if (! $cursor['parent_id']) {
                    break;
                }

                $cursor = $byId->get($cursor['parent_id']);
            }

            return count($segments) > 0 ? implode(' / ', $segments) : null;
        };

        $result = $notes
            ->map(fn (Note $note) => [
                'id' => $note->id,
                'title' => $note->display_title,
                'path' => $note->parent_id ? $resolvePath($note->parent_id) : null,
                'parent_id' => $note->parent_id,
            ])
            ->sortBy(fn (array $n) => strtolower((string) $n['path'].' '.$n['title']))
            ->values()
            ->all();

        Cache::put("notes_dropdown_linkable_{$workspace->id}", $result, now()->addDay());
    }

    private function warmMeetingParentOptions(Workspace $workspace): void
    {
        $notes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('type', [Note::TYPE_NOTE, null])
            ->get(['id', 'title', 'parent_id', 'properties']);

        /** @var \Illuminate\Support\Collection<string, array{id: string, title: string, parent_id: string|null}> $byId */
        $byId = $notes->keyBy('id');

        $resolvePath = function (string $noteId) use ($byId): ?string {
            $segments = [];
            $visited = [];
            $cursor = $byId->get($noteId);

            while ($cursor !== null && ! isset($visited[$cursor['id']])) {
                $visited[$cursor['id']] = true;
                array_unshift($segments, $cursor['title'] ?? 'Untitled');

                if (! $cursor['parent_id']) {
                    break;
                }

                $cursor = $byId->get($cursor['parent_id']);
            }

            return count($segments) > 0 ? implode(' / ', $segments) : null;
        };

        $result = $notes
            ->map(fn (Note $note) => [
                'id' => $note->id,
                'title' => $note->display_title,
                'path' => $note->parent_id ? $resolvePath($note->parent_id) : null,
                'is_journal' => false,
            ])
            ->sortBy(fn (array $n) => strtolower((string) $n['path'].' '.$n['title']))
            ->values()
            ->all();

        Cache::put("notes_dropdown_parents_{$workspace->id}", $result, now()->addDay());
    }
}
