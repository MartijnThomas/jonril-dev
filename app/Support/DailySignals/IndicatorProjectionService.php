<?php

namespace App\Support\DailySignals;

use App\Models\Workspace;
use App\Models\WorkspaceDailyIndicator;
use App\Models\WorkspaceDailySignal;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class IndicatorProjectionService
{
    public function projectDate(Workspace $workspace, CarbonInterface $date): WorkspaceDailyIndicator
    {
        $signalDate = $date->toDateString();
        $signals = WorkspaceDailySignal::query()
            ->where('workspace_id', $workspace->id)
            ->whereDate('date', $signalDate)
            ->get(['signal_key', 'state', 'value_json'])
            ->keyBy('signal_key');

        $captureState = (string) ($signals->get('capture_activity')?->state ?? '');
        $meetingState = (string) ($signals->get('meeting_load')?->state ?? '');
        $taskRiskState = (string) ($signals->get('task_risk')?->state ?? '');
        $calendarSyncState = (string) ($signals->get('calendar_sync_health')?->state ?? '');
        $timeblockHealthState = (string) ($signals->get('timeblock_health')?->state ?? '');

        $birthdayCount = $this->signalIntValue($signals, 'birthday_or_special', 'birthday_count');
        $meetingCount = $this->signalIntValue($signals, 'meeting_load', 'meeting_count');
        $eventCount = $this->signalIntValue($signals, 'meeting_load', 'event_count');
        $timeblockCount = $this->signalIntValue($signals, 'timeblock_health', 'timeblock_count');
        $taskOpenCount = $this->signalIntValue($signals, 'task_risk', 'open_count');
        $taskCompletedCount = $this->signalIntValue($signals, 'completion_trend', 'completed_count');

        $hasNote = in_array($captureState, ['has_content', 'high_activity', 'note_empty'], true);
        $hasEvents = $eventCount > 0 || $meetingCount > 0 || $timeblockCount > 0 || $birthdayCount > 0;

        $structureState = $hasNote ? 'note_exists' : null;
        $calendarState = match (true) {
            $calendarSyncState === 'failed' => 'sync_failed',
            $timeblockHealthState === 'overdue_unsynced' => 'unsynced',
            $meetingState === 'conflict_detected' => 'conflict',
            $hasEvents => 'active',
            default => null,
        };
        $workState = match (true) {
            $taskRiskState === 'overdue_open' => 'red',
            $taskRiskState === 'due_open' => 'orange',
            $taskOpenCount === 0 && $taskCompletedCount > 0 => 'green',
            default => null,
        };

        $payload = [
            'structure_state' => $structureState,
            'calendar_state' => $calendarState,
            'work_state' => $workState,
            'has_note' => $hasNote,
            'has_events' => $hasEvents,
            'events_count' => max(0, $eventCount),
            'birthday_count' => max(0, $birthdayCount),
            'tasks_open_count' => $taskOpenCount,
            'tasks_completed_count' => $taskCompletedCount,
        ];

        $existing = WorkspaceDailyIndicator::query()
            ->where('workspace_id', $workspace->id)
            ->whereDate('date', $signalDate)
            ->first();

        if ($existing !== null) {
            $existing->update($payload);

            return $existing->fresh();
        }

        return WorkspaceDailyIndicator::query()->create([
            'workspace_id' => $workspace->id,
            'date' => $signalDate,
            ...$payload,
        ]);
    }

    /**
     * @param  Collection<int, WorkspaceDailySignal>  $signals
     */
    private function signalIntValue(Collection $signals, string $key, string $field): int
    {
        return (int) data_get($signals->get($key)?->value_json, $field, 0);
    }
}
