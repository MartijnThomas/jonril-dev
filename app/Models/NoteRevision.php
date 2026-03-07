<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NoteRevision extends Model
{
    use HasUuids;

    protected $fillable = [
        'note_id',
        'user_id',
        'title',
        'content',
        'properties',
    ];

    protected function casts(): array
    {
        return [
            'content' => 'array',
            'properties' => 'array',
        ];
    }

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
