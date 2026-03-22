<?php

namespace App\Jobs;

use App\Models\Calendar;
use App\Services\CalDavService;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

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

        $windowStartDays = max((int) config('calendar.sync_period.start', 7), 0);
        $windowEndDays = max((int) config('calendar.sync_period.end', 30), 0);

        $rangeStart = now()->subDays($windowStartDays)->startOfDay();
        $rangeEnd = now()->addDays($windowEndDays)->endOfDay();

        $lockKey = implode(':', [
            'daily-signals:calendar-sync-window',
            (string) $this->calendar->workspace_id,
            $rangeStart->toDateString(),
            $rangeEnd->toDateString(),
        ]);

        if (! Cache::add($lockKey, '1', now()->addSeconds(15))) {
            return;
        }

        RecalculateDailySignalsJob::dispatch(
            $this->calendar->workspace_id,
            $this->windowDates($rangeStart, $rangeEnd),
        );
    }

    /**
     * @return array<int, string>
     */
    private function windowDates(CarbonInterface $start, CarbonInterface $end): array
    {
        $dates = [];
        $cursor = $start->copy()->startOfDay();

        while ($cursor->lte($end)) {
            $dates[] = $cursor->toDateString();
            $cursor = $cursor->addDay();
        }

        return $dates;
    }
}
