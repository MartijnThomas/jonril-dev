<?php

namespace App\Support\Notes;

use App\Models\Note;
use App\Models\Workspace;
use Illuminate\Support\Str;

class NoteSlugService
{
    /**
     * @var array<string>
     */
    private array $reservedRootSegments = [
        'journal',
    ];

    public function findByReference(Workspace $workspace, string $reference): ?Note
    {
        $trimmed = trim($reference, '/');
        if ($trimmed === '') {
            return null;
        }

        if (Str::isUuid($trimmed)) {
            $byId = $workspace->notes()->where('id', $trimmed)->first();
            if ($byId) {
                return $byId;
            }
        }

        return $workspace->notes()->where('slug', $trimmed)->first();
    }

    public function urlFor(Note $note): string
    {
        $workspaceSlug = $this->workspaceSlugFor($note);

        if ($note->type === Note::TYPE_JOURNAL && $note->journal_granularity && $note->journal_date) {
            $period = app(JournalNoteService::class)->periodFor(
                $note->journal_granularity,
                $note->journal_date,
            );

            return "/w/{$workspaceSlug}/journal/{$note->journal_granularity}/{$period}";
        }

        $reference = $note->slug ?: $note->id;

        return "/w/{$workspaceSlug}/notes/{$reference}";
    }

    public function updateUrlFor(Note $note): string
    {
        $workspaceSlug = $this->workspaceSlugFor($note);

        return "/w/{$workspaceSlug}/notes/{$note->id}";
    }

    public function journalUrlFor(Workspace|string $workspace, string $granularity, string $period): string
    {
        $workspaceSlug = $workspace instanceof Workspace
            ? $workspace->slug
            : trim($workspace);

        return "/w/{$workspaceSlug}/journal/{$granularity}/{$period}";
    }

    public function syncNoteAndDescendants(Note $note): void
    {
        if ($note->type !== Note::TYPE_NOTE) {
            return;
        }

        $this->syncSingleNote($note);

        /** @var \Illuminate\Database\Eloquent\Collection<int, Note> $children */
        $children = $note->children()->get();
        foreach ($children as $child) {
            $this->syncNoteAndDescendants($child);
        }
    }

    public function syncSingleNote(Note $note): void
    {
        if ($note->type !== Note::TYPE_NOTE) {
            return;
        }

        $desired = $this->buildPathSlug($note);
        $unique = $this->makeUnique($note, $desired);

        if ($note->slug === $unique) {
            return;
        }

        $note->slug = $unique;
        $note->save();
    }

    private function buildPathSlug(Note $note): string
    {
        $segments = [];
        $visited = [];
        $cursor = $note;

        while ($cursor !== null && ! isset($visited[$cursor->id])) {
            $visited[$cursor->id] = true;
            $segments[] = $this->slugSegment($this->baseTitle($cursor) ?: 'Untitled');

            if (! $cursor->parent_id) {
                break;
            }

            $cursor = $cursor->parent;
        }

        $segments = array_reverse($segments);

        if (in_array($segments[0] ?? '', $this->reservedRootSegments, true)) {
            $segments[0] = "note-{$segments[0]}";
        }

        return implode('/', $segments);
    }

    private function baseTitle(Note $note): ?string
    {
        $raw = $note->getRawOriginal('title');
        if (! is_string($raw)) {
            return null;
        }

        $trimmed = trim($raw);

        return $trimmed !== '' ? $trimmed : null;
    }

    private function slugSegment(string $value): string
    {
        $segment = Str::slug($value);

        return $segment !== '' ? $segment : 'untitled';
    }

    private function makeUnique(Note $note, string $candidate): string
    {
        $base = $candidate;
        $suffix = 0;

        while (true) {
            $current = $suffix === 0 ? $base : "{$base}-{$suffix}";

            $exists = Note::query()
                ->withTrashed()
                ->where('workspace_id', $note->workspace_id)
                ->where('slug', $current)
                ->where('id', '!=', $note->id)
                ->exists();

            if (! $exists) {
                return $current;
            }

            $suffix++;
        }
    }

    private function workspaceSlugFor(Note $note): string
    {
        $slug = $note->workspace?->slug;
        if (is_string($slug) && trim($slug) !== '') {
            return trim($slug);
        }

        $workspace = Workspace::query()
            ->where('id', $note->workspace_id)
            ->select(['id', 'slug'])
            ->first();

        return (string) ($workspace?->slug ?? 'workspace');
    }
}
