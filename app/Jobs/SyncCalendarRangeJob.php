<?php

namespace App\Jobs;

use App\Models\Calendar;
use App\Services\CalDavService;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class SyncCalendarRangeJob implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 30;

    public function __construct(
        public readonly Calendar $calendar,
        public readonly string $period,
    ) {}

    /**
     * Prevent duplicate jobs for the same calendar + period from queuing simultaneously.
     */
    public function uniqueId(): string
    {
        return "calendar-{$this->calendar->id}-{$this->period}";
    }

    public function handle(CalDavService $calDavService): void
    {
        if (! $this->calendar->is_active) {
            return;
        }

        $calDavService->syncPeriod($this->calendar, $this->period);
    }
}
