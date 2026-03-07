<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteHeading;
use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteHeadingIndexer;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CommandSearchController extends Controller
{
    public function __construct(
        private readonly NoteHeadingIndexer $noteHeadingIndexer,
    ) {}

    public function __invoke(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $workspaceIds = $user->workspaces()->pluck('workspaces.id')->values()->all();
        if ($workspaceIds === []) {
            abort(403);
        }

        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:160'],
            'mode' => ['nullable', Rule::in(['notes', 'headings'])],
            'include_journal' => ['nullable', 'boolean'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $mode = $data['mode'] ?? 'notes';
        $query = trim((string) ($data['q'] ?? ''));
        $includeJournal = (bool) ($data['include_journal'] ?? false);
        $limit = (int) ($data['limit'] ?? 40);

        if ($mode === 'headings') {
            $this->ensureHeadingIndexBackfilled($workspaceIds);

            return response()->json([
                'mode' => 'headings',
                'items' => $this->searchHeadings(
                    workspaceIds: $workspaceIds,
                    query: $query,
                    includeJournal: $includeJournal,
                    limit: $limit,
                ),
            ]);
        }

        return response()->json([
            'mode' => 'notes',
            'items' => $this->searchNotes(
                workspaceIds: $workspaceIds,
                query: $query,
                includeJournal: $includeJournal,
                limit: $limit,
            ),
        ]);
    }

    /**
     * @param  array<int, string>  $workspaceIds
     */
    private function ensureHeadingIndexBackfilled(array $workspaceIds): void
    {
        $hasAnyHeading = NoteHeading::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->exists();

        if ($hasAnyHeading) {
            return;
        }

        Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->select(['id', 'workspace_id', 'content'])
            ->orderBy('id')
            ->chunk(100, function ($notes): void {
                foreach ($notes as $note) {
                    $this->noteHeadingIndexer->reindexNote($note);
                }
            });
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array<string, mixed>>
     */
    private function searchNotes(
        array $workspaceIds,
        string $query,
        bool $includeJournal,
        int $limit,
    ): array {
        $notes = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->when(! $includeJournal, function ($q) {
                $q->where(function ($inner) {
                    $inner->whereNull('type')
                        ->orWhere('type', '!=', Note::TYPE_JOURNAL);
                });
            })
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($inner) use ($query) {
                    $inner->where('title', 'like', "%{$query}%")
                        ->orWhere('slug', 'like', "%{$query}%");
                });
            })
            ->orderByRaw('case when type = ? then 1 else 0 end', [Note::TYPE_JOURNAL])
            ->orderByDesc('updated_at')
            ->limit($limit)
            ->get([
                'id',
                'title',
                'slug',
                'type',
                'journal_granularity',
                'journal_date',
            ]);

        return $notes
            ->map(function (Note $note): array {
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
                    'path' => $note->slug,
                    'type' => $note->type,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array<string, mixed>>
     */
    private function searchHeadings(
        array $workspaceIds,
        string $query,
        bool $includeJournal,
        int $limit,
    ): array {
        $headings = NoteHeading::query()
            ->whereIn('note_headings.workspace_id', $workspaceIds)
            ->join('notes', 'notes.id', '=', 'note_headings.note_id')
            ->when(! $includeJournal, function ($q) {
                $q->where(function ($inner) {
                    $inner->whereNull('notes.type')
                        ->orWhere('notes.type', '!=', Note::TYPE_JOURNAL);
                });
            })
            ->when($query !== '', function ($q) use ($query) {
                $q->where(function ($inner) use ($query) {
                    $inner->where('note_headings.text', 'like', "%{$query}%")
                        ->orWhere('notes.title', 'like', "%{$query}%")
                        ->orWhere('notes.slug', 'like', "%{$query}%");
                });
            })
            ->orderByDesc('note_headings.updated_at')
            ->limit($limit)
            ->get([
                'note_headings.id as row_id',
                'note_headings.note_id',
                'note_headings.block_id',
                'note_headings.level',
                'note_headings.text',
                'notes.title as note_title',
                'notes.slug as note_slug',
                'notes.type as note_type',
                'notes.journal_granularity',
                'notes.journal_date',
            ]);

        return $headings
            ->map(function ($row): array {
                $href = '/notes/'.($row->note_slug ?: $row->note_id);

                if (
                    $row->note_type === Note::TYPE_JOURNAL
                    && $row->journal_granularity
                    && $row->journal_date
                ) {
                    $period = app(JournalNoteService::class)->periodFor(
                        $row->journal_granularity,
                        $row->journal_date,
                    );
                    $href = "/journal/{$row->journal_granularity}/{$period}";
                }

                $blockId = (string) $row->block_id;

                return [
                    'id' => (string) $row->row_id,
                    'note_id' => (string) $row->note_id,
                    'heading_id' => $blockId,
                    'heading' => (string) $row->text,
                    'level' => is_numeric($row->level) ? (int) $row->level : null,
                    'note_title' => (string) ($row->note_title ?: 'Untitled'),
                    'href' => "{$href}#{$blockId}",
                    'slug' => $row->note_slug,
                    'path' => $row->note_slug,
                    'type' => $row->note_type,
                ];
            })
            ->values()
            ->all();
    }
}
