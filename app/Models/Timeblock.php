<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphOne;

class Timeblock extends Model
{
    use HasUuids;

    protected $fillable = [
        'location',
        'task_block_id',
        'task_checked',
        'task_status',
        'meta',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'task_checked' => 'boolean',
            'meta' => 'array',
        ];
    }

    public function event(): MorphOne
    {
        return $this->morphOne(Event::class, 'eventable');
    }
}
