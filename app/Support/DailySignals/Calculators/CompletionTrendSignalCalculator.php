<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class CompletionTrendSignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'completion_trend';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $tasks = NoteTask::query()
            ->where('workspace_id', $workspace->id)
            ->where(function ($query) use ($date): void {
                $query->whereDate('journal_date', $date->toDateString())
                    ->orWhereDate('due_date', $date->toDateString())
                    ->orWhereDate('deadline_date', $date->toDateString())
                    ->orWhereHas('note', function ($noteQuery) use ($date): void {
                        $noteQuery
                            ->where('type', Note::TYPE_JOURNAL)
                            ->where('journal_granularity', Note::JOURNAL_DAILY)
                            ->whereDate('journal_date', $date->toDateString());
                    });
            })
            ->get(['checked', 'task_status']);

        $openCount = 0;
        $completedCount = 0;
        foreach ($tasks as $task) {
            $status = strtolower(trim((string) $task->task_status));
            if (! $task->checked && in_array($status, ['canceled', 'migrated'], true)) {
                continue;
            }

            if ($task->checked) {
                $completedCount++;
            } else {
                $openCount++;
            }
        }

        $total = $openCount + $completedCount;
        $ratio = $total > 0 ? round(($completedCount / $total) * 100, 2) : 0.0;

        $state = match (true) {
            $total === 0 => 'no_tasks',
            $openCount === 0 => 'all_completed',
            $completedCount === 0 => 'no_progress',
            default => 'partial_progress',
        };

        return new DailySignalResult(
            key: $this->key(),
            state: $state,
            value: [
                'open_count' => $openCount,
                'completed_count' => $completedCount,
                'completion_ratio' => $ratio,
            ],
        );
    }
}
