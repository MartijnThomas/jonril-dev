<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphOne;

class CalendarItem extends Model
{
    use HasUuids;

    protected $fillable = [
        'calendar_id',
        'uid',
        'etag',
        'href',
        'location',
        'description',
        'rrule',
        'raw_ical',
    ];

    public function calendar(): BelongsTo
    {
        return $this->belongsTo(Calendar::class);
    }

    public function event(): MorphOne
    {
        return $this->morphOne(Event::class, 'eventable');
    }
}
