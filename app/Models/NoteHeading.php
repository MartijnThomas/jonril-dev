<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NoteHeading extends Model
{
    protected $fillable = [
        'workspace_id',
        'note_id',
        'block_id',
        'level',
        'text',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'level' => 'integer',
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
