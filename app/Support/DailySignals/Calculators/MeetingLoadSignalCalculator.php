<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\Event;
use App\Models\Note;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class MeetingLoadSignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'meeting_load';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $activeCalendarIds = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->pluck('id');

        $dayStart = $date->copy()->startOfDay()->timezone('UTC');
        $dayEnd = $date->copy()->endOfDay()->timezone('UTC');

        $eventCount = Event::query()
            ->where('workspace_id', $workspace->id)
            ->whereNull('remote_deleted_at')
            ->where('starts_at', '<=', $dayEnd)
            ->where('ends_at', '>=', $dayStart)
            ->where(function ($query) use ($activeCalendarIds): void {
                $query->whereNot('eventable_type', CalendarItem::class)
                    ->orWhereHasMorph('eventable', CalendarItem::class, function ($q2) use ($activeCalendarIds): void {
                        $q2->whereIn('calendar_id', $activeCalendarIds);
                    });
            })
            ->count();

        $events = Event::query()
            ->where('workspace_id', $workspace->id)
            ->whereNull('remote_deleted_at')
            ->whereDate('starts_at', $date->toDateString())
            ->where('all_day', false)
            ->whereHas('note', function ($query): void {
                $query->where('type', Note::TYPE_MEETING);
            })
            ->get(['starts_at', 'ends_at']);

        $meetingCount = $events->count();
        if ($meetingCount === 0) {
            return new DailySignalResult(
                key: $this->key(),
                state: 'free_day',
                value: [
                    'meeting_count' => 0,
                    'event_count' => $eventCount,
                    'has_conflict' => false,
                ],
            );
        }

        $hasConflict = false;
        $sorted = $events->sortBy('starts_at')->values();
        for ($i = 1; $i < $sorted->count(); $i++) {
            $previous = $sorted[$i - 1];
            $current = $sorted[$i];
            if ($previous->ends_at !== null && $current->starts_at !== null && $previous->ends_at->gt($current->starts_at)) {
                $hasConflict = true;
                break;
            }
        }

        return new DailySignalResult(
            key: $this->key(),
            state: $hasConflict ? 'conflict_detected' : 'has_meetings',
            value: [
                'meeting_count' => $meetingCount,
                'event_count' => $eventCount,
                'has_conflict' => $hasConflict,
            ],
        );
    }
}
