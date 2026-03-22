<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\NoteTask;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class MigrationStateSignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'migration_state';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $query = NoteTask::query()
            ->where('workspace_id', $workspace->id)
            ->whereDate('journal_date', $date->toDateString())
            ->where('task_status', 'migrated');

        $migratedCount = (clone $query)->count();
        $unresolvedCount = (clone $query)->whereNull('migrated_to_note_id')->count();

        if ($migratedCount === 0) {
            return new DailySignalResult(
                key: $this->key(),
                state: 'no_migration',
                value: ['migrated_count' => 0, 'unresolved_count' => 0],
            );
        }

        return new DailySignalResult(
            key: $this->key(),
            state: $unresolvedCount > 0 ? 'unresolved_links' : 'has_migrated',
            value: ['migrated_count' => $migratedCount, 'unresolved_count' => $unresolvedCount],
        );
    }
}
