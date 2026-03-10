<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NoteTask extends Model
{
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
        'priority',
        'content_text',
        'render_fragments',
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
            'due_date' => 'date',
            'deadline_date' => 'date',
            'journal_date' => 'date',
            'render_fragments' => 'array',
            'mentions' => 'array',
            'hashtags' => 'array',
        ];
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
