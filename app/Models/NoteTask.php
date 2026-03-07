<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NoteTask extends Model
{
    protected $fillable = [
        'user_id',
        'note_id',
        'note_title',
        'parent_note_id',
        'parent_note_title',
        'position',
        'checked',
        'content_text',
        'due_date',
        'deadline_date',
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
            'mentions' => 'array',
            'hashtags' => 'array',
        ];
    }

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }
}
