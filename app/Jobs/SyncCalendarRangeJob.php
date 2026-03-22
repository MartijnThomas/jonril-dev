<?php

namespace App\Jobs;

use App\Models\Calendar;
use App\Services\CalDavService;
use Carbon\Carbon;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

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

        $lockKey = implode(':', [
            'daily-signals:calendar-sync-period',
            (string) $this->calendar->workspace_id,
            $this->period,
        ]);

        if (! Cache::add($lockKey, '1', now()->addSeconds(15))) {
            return;
        }

        RecalculateDailySignalsJob::dispatch(
            $this->calendar->workspace_id,
            $this->periodDates(),
        );
    }

    /**
     * @return array<int, string>
     */
    private function periodDates(): array
    {
        try {
            $month = Carbon::createFromFormat('Y-m', $this->period)->startOfMonth();
        } catch (\Throwable) {
            return [];
        }

        $end = $month->copy()->endOfMonth();
        $dates = [];
        $cursor = $month->copy();

        while ($cursor->lte($end)) {
            $dates[] = $cursor->toDateString();
            $cursor = $cursor->addDay();
        }

        return $dates;
    }
}
