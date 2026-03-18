<?php

namespace App\Models;

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
        return [
            'note_title' => $this->note_title,
            'parent_note_title' => $this->parent_note_title,
            'content_text' => $this->content_text,
            'hashtags' => $this->hashtags ?? [],
            'mentions' => $this->mentions ?? [],
            'workspace_id' => $this->workspace_id,
            'note_id' => $this->note_id,
            'parent_note_id' => $this->parent_note_id,
            'checked' => $this->checked,
            'task_status' => $this->task_status,
            'search_status' => $this->normalizedSearchStatus(),
            'due_date' => $this->due_date?->toDateString(),
            'deadline_date' => $this->deadline_date?->toDateString(),
            'journal_date' => $this->journal_date?->toDateString(),
        ];
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

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
