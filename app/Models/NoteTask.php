<?php

namespace App\Models;

use App\Support\Notes\JournalNoteService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Laravel\Scout\Searchable;

class NoteTask extends Model
{
    use Searchable;

    protected $fillable = [
        'workspace_id',
        'note_id',
        'block_id',
        'section_heading',
        'note_title',
        'parent_note_id',
        'parent_note_title',
        'position',
        'checked',
        'task_status',
        'canceled_at',
        'completed_at',
        'started_at',
        'backlog_promoted_at',
        'migrated_to_note_id',
        'migrated_from_note_id',
        'priority',
        'content_text',
        'render_fragments',
        'children',
        'due_date',
        'deadline_date',
        'journal_date',
        'mentions',
        'hashtags',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'checked' => 'boolean',
            'canceled_at' => 'datetime',
            'completed_at' => 'datetime',
            'started_at' => 'datetime',
            'backlog_promoted_at' => 'datetime',
            'due_date' => 'date',
            'deadline_date' => 'date',
            'journal_date' => 'date',
            'render_fragments' => 'array',
            'children' => 'array',
            'mentions' => 'array',
            'hashtags' => 'array',
        ];
    }

    public function searchableAs(): string
    {
        return 'note_tasks';
    }

    /**
     * @return array<string, mixed>
     */
    public function toSearchableArray(): array
    {
        $note = $this->relationLoaded('note')
            ? $this->note
            : $this->note()->select([
                'id',
                'workspace_id',
                'title',
                'slug',
                'type',
                'properties',
                'journal_granularity',
                'journal_date',
                'parent_id',
            ])->first();
        $workspaceSlug = $this->searchWorkspaceSlug();
        $noteDisplayTitle = $note?->display_title ?? (is_string($this->note_title) ? $this->note_title : 'Untitled');
        $notePath = $note?->path ?? $noteDisplayTitle;
        $noteJournalPathNl = $note?->journalSearchPath('nl');
        $noteJournalPathEn = $note?->journalSearchPath('en');
        $noteHref = $this->searchNoteHref($note, $workspaceSlug);
        $taskHref = $noteHref !== null && is_string($this->block_id) && trim($this->block_id) !== ''
            ? "{$noteHref}#{$this->block_id}"
            : $noteHref;

        return [
            'id' => $this->id,
            'note_title' => $this->note_title,
            'parent_note_title' => $this->parent_note_title,
            'content_text' => $this->content_text,
            'hashtags' => $this->hashtags ?? [],
            'mentions' => $this->mentions ?? [],
            'workspace_slug' => $workspaceSlug,
            'block_id' => $this->block_id,
            'section_heading' => $this->section_heading,
            'href' => $taskHref,
            'note_href' => $noteHref,
            'note_display_title' => $noteDisplayTitle,
            'note_path' => $notePath,
            'note_journal_path_nl' => $noteJournalPathNl,
            'note_journal_path_en' => $noteJournalPathEn,
            'note_type' => $note?->type,
            'note_journal_granularity' => $note?->journal_granularity,
            'note_icon' => $note?->icon,
            'note_icon_color' => $note?->icon_color,
            'note_icon_bg' => $note?->icon_bg,
            'workspace_id' => $this->workspace_id,
            'note_id' => $this->note_id,
            'parent_note_id' => $this->parent_note_id,
            'checked' => $this->checked,
            'task_status' => $this->task_status,
            'search_status' => $this->normalizedSearchStatus(),
            'search_status_rank' => $this->normalizedSearchStatusRank(),
            'due_date' => $this->due_date?->toDateString(),
            'deadline_date' => $this->deadline_date?->toDateString(),
            'journal_date' => $this->journal_date?->toDateString(),
        ];
    }

    private function searchWorkspaceSlug(): string
    {
        $workspace = $this->relationLoaded('workspace')
            ? $this->workspace
            : $this->workspace()->select(['id', 'slug'])->first();

        return is_string($workspace?->slug) && trim($workspace->slug) !== ''
            ? trim($workspace->slug)
            : 'workspace';
    }

    private function searchNoteHref(?Note $note, string $workspaceSlug): ?string
    {
        if (! is_string($this->note_id) || trim($this->note_id) === '') {
            return null;
        }

        if (
            $note?->type === Note::TYPE_JOURNAL
            && is_string($note->journal_granularity)
            && $note->journal_granularity !== ''
            && $note->journal_date !== null
        ) {
            $period = app(JournalNoteService::class)->periodFor(
                $note->journal_granularity,
                $note->journal_date,
            );

            return "/w/{$workspaceSlug}/journal/{$period}";
        }

        return "/w/{$workspaceSlug}/notes/{$this->note_id}";
    }

    private function normalizedSearchStatus(): string
    {
        if ($this->checked) {
            return 'completed';
        }

        $status = strtolower(trim((string) $this->task_status));
        if (in_array($status, ['canceled', 'migrated', 'assigned', 'in_progress', 'starred'], true)) {
            return $status;
        }

        if (in_array($status, ['backlog', 'question'], true)) {
            return 'backlog';
        }

        return 'open';
    }

    private function normalizedSearchStatusRank(): int
    {
        return match ($this->normalizedSearchStatus()) {
            'open' => 100,
            'in_progress' => 90,
            'assigned' => 80,
            'backlog' => 70,
            'starred' => 60,
            'completed' => 40,
            'migrated' => 20,
            'canceled' => 10,
            default => 0,
        };
    }

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
