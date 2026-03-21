<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TimeblockCalendarLink extends Model
{
    use HasUuids;

    public const STATUS_PENDING_CREATE = 'pending_create';

    public const STATUS_PENDING_UPDATE = 'pending_update';

    public const STATUS_PENDING_DELETE = 'pending_delete';

    public const STATUS_SYNCED = 'synced';

    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'workspace_id',
        'calendar_id',
        'note_id',
        'event_id',
        'timeblock_id',
        'remote_uid',
        'remote_href',
        'remote_etag',
        'sync_status',
        'last_synced_at',
        'last_error',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_synced_at' => 'datetime',
        ];
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function calendar(): BelongsTo
    {
        return $this->belongsTo(Calendar::class);
    }

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function timeblock(): BelongsTo
    {
        return $this->belongsTo(Timeblock::class);
    }
}
