<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\Calendar;
use App\Models\TimeblockCalendarLink;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class CalendarSyncHealthSignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'calendar_sync_health';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $activeCalendars = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->get(['id', 'last_synced_at']);

        $activeCount = $activeCalendars->count();
        if ($activeCount === 0) {
            return new DailySignalResult(
                key: $this->key(),
                state: 'no_active_calendars',
                value: ['active_count' => 0, 'failed_count' => 0, 'stale_count' => 0],
            );
        }

        $staleCount = $activeCalendars
            ->filter(fn (Calendar $calendar): bool => $calendar->last_synced_at === null || $calendar->last_synced_at->lt(now()->subHours(6)))
            ->count();

        $failedCount = TimeblockCalendarLink::query()
            ->where('workspace_id', $workspace->id)
            ->whereDate('updated_at', $date->toDateString())
            ->where('sync_status', TimeblockCalendarLink::STATUS_FAILED)
            ->count();

        $state = $failedCount > 0
            ? 'failed'
            : ($staleCount > 0 ? 'stale' : 'ok');

        return new DailySignalResult(
            key: $this->key(),
            state: $state,
            value: [
                'active_count' => $activeCount,
                'failed_count' => $failedCount,
                'stale_count' => $staleCount,
            ],
        );
    }
}
