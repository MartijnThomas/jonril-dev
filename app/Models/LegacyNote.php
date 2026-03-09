<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LegacyNote extends Model
{
    use HasUuids;

    protected $fillable = [
        'workspace_id',
        'note_id',
        'legacy_note_id',
        'legacy_team_id',
        'legacy_slug',
        'legacy_hash',
        'legacy_note_payload',
        'legacy_frontmatter_raw',
        'legacy_frontmatter',
        'legacy_blocks',
        'imported_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'legacy_note_payload' => 'array',
            'legacy_frontmatter' => 'array',
            'legacy_blocks' => 'array',
            'imported_at' => 'datetime',
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
}
