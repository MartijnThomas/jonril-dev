<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\Note;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class CaptureActivitySignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'capture_activity';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $note = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where('type', Note::TYPE_JOURNAL)
            ->where('journal_granularity', Note::JOURNAL_DAILY)
            ->whereDate('journal_date', $date->toDateString())
            ->first(['id', 'meta']);

        if (! $note) {
            return new DailySignalResult(
                key: $this->key(),
                state: 'no_note',
                value: ['note_exists' => false, 'word_count' => 0, 'tasks_total' => 0],
            );
        }

        $wordCount = (int) data_get($note->meta, 'word_count', 0);
        $tasksTotal = (int) data_get($note->meta, 'task_counts.total', 0);
        $hasContent = $wordCount > 0 || $tasksTotal > 0;
        $highActivity = $wordCount >= 300 || $tasksTotal >= 10;

        return new DailySignalResult(
            key: $this->key(),
            state: $highActivity ? 'high_activity' : ($hasContent ? 'has_content' : 'note_empty'),
            value: [
                'note_exists' => true,
                'word_count' => $wordCount,
                'tasks_total' => $tasksTotal,
            ],
        );
    }
}
