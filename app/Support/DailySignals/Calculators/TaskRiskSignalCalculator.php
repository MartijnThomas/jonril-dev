<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class TaskRiskSignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'task_risk';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $tasks = NoteTask::query()
            ->where('workspace_id', $workspace->id)
            ->where(function ($query) use ($date): void {
                $query->whereDate('due_date', $date->toDateString())
                    ->orWhereDate('deadline_date', $date->toDateString())
                    ->orWhereDate('journal_date', $date->toDateString())
                    ->orWhereHas('note', function ($noteQuery) use ($date): void {
                        $noteQuery
                            ->where('type', Note::TYPE_JOURNAL)
                            ->where('journal_granularity', Note::JOURNAL_DAILY)
                            ->whereDate('journal_date', $date->toDateString());
                    });
            })
            ->with(['note:id,type,journal_granularity,journal_date'])
            ->get(['checked', 'task_status', 'due_date', 'deadline_date']);

        $openCount = 0;
        $overdueCount = 0;
        foreach ($tasks as $task) {
            $status = strtolower(trim((string) $task->task_status));
            $ignored = ! $task->checked && in_array($status, ['canceled', 'migrated'], true);
            if ($ignored || $task->checked) {
                continue;
            }

            $openCount++;
            $noteDate = null;
            if (
                $task->note !== null
                && $task->note->type === Note::TYPE_JOURNAL
                && $task->note->journal_granularity === Note::JOURNAL_DAILY
            ) {
                $noteDate = $task->note->journal_date;
            }

            $deadline = $task->deadline_date ?? $task->due_date ?? $noteDate;
            if ($deadline !== null && $deadline->lt(now($date->getTimezone())->startOfDay())) {
                $overdueCount++;
            }
        }

        if ($openCount === 0) {
            return new DailySignalResult(
                key: $this->key(),
                state: 'all_clear',
                value: ['open_count' => 0, 'overdue_open_count' => 0],
            );
        }

        return new DailySignalResult(
            key: $this->key(),
            state: $overdueCount > 0 ? 'overdue_open' : 'due_open',
            value: ['open_count' => $openCount, 'overdue_open_count' => $overdueCount],
        );
    }
}
