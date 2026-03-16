<?php

namespace App\Jobs;

use App\Models\Calendar;
use App\Services\CalDavService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SyncCalendarJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(public readonly Calendar $calendar) {}

    public function handle(CalDavService $calDavService): void
    {
        if (! $this->calendar->is_active) {
            return;
        }

        $calDavService->sync($this->calendar);
    }
}
