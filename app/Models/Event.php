<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

class Event extends Model
{
    use HasUuids;

    protected $fillable = [
        'workspace_id',
        'note_id',
        'block_id',
        'eventable_type',
        'eventable_id',
        'title',
        'starts_at',
        'ends_at',
        'all_day',
        'timezone',
        'journal_date',
        'meta',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'all_day' => 'boolean',
            'journal_date' => 'date',
            'meta' => 'array',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function note(): BelongsTo
    {
        return $this->belongsTo(Note::class);
    }

    public function eventable(): MorphTo
    {
        return $this->morphTo();
    }
}
