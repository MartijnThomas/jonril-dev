<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WorkspaceDailyIndicator extends Model
{
    use HasUuids;

    /**
     * @var list<string>
     */
    protected $fillable = [
        'workspace_id',
        'date',
        'structure_state',
        'calendar_state',
        'work_state',
        'has_note',
        'has_events',
        'tasks_open_count',
        'tasks_completed_count',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'date' => 'date',
            'has_note' => 'boolean',
            'has_events' => 'boolean',
            'tasks_open_count' => 'integer',
            'tasks_completed_count' => 'integer',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}
