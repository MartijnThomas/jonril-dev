<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\Event;
use App\Models\Timeblock;
use App\Models\TimeblockCalendarLink;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class TimeblockHealthSignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'timeblock_health';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $events = Event::query()
            ->where('workspace_id', $workspace->id)
            ->where('eventable_type', Timeblock::class)
            ->whereDate('journal_date', $date->toDateString())
            ->get(['id']);

        $timeblockCount = $events->count();
        if ($timeblockCount === 0) {
            return new DailySignalResult(
                key: $this->key(),
                state: 'no_plan',
                value: ['timeblock_count' => 0, 'unsynced_count' => 0],
            );
        }

        $unsyncedCount = TimeblockCalendarLink::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('event_id', $events->pluck('id')->all())
            ->where('sync_status', TimeblockCalendarLink::STATUS_FAILED)
            ->count();

        $state = $unsyncedCount > 0 && $date->lt(now($date->getTimezone())->startOfDay())
            ? 'overdue_unsynced'
            : 'planned_focus_blocks';

        return new DailySignalResult(
            key: $this->key(),
            state: $unsyncedCount > 0 ? $state : 'planned_focus_blocks',
            value: ['timeblock_count' => $timeblockCount, 'unsynced_count' => $unsyncedCount],
        );
    }
}
