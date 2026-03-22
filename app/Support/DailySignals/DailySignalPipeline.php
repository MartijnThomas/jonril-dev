<?php

namespace App\Support\DailySignals;

use App\Models\Workspace;
use App\Models\WorkspaceDailySignal;
use App\Support\DailySignals\Calculators\BirthdayOrSpecialSignalCalculator;
use App\Support\DailySignals\Calculators\CalendarSyncHealthSignalCalculator;
use App\Support\DailySignals\Calculators\CaptureActivitySignalCalculator;
use App\Support\DailySignals\Calculators\CompletionTrendSignalCalculator;
use App\Support\DailySignals\Calculators\MeetingLoadSignalCalculator;
use App\Support\DailySignals\Calculators\MigrationStateSignalCalculator;
use App\Support\DailySignals\Calculators\TaskRiskSignalCalculator;
use App\Support\DailySignals\Calculators\TimeblockHealthSignalCalculator;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

class DailySignalPipeline
{
    /**
     * @var array<int, DailySignalCalculator>
     */
    private array $calculators;

    public function __construct(
        MeetingLoadSignalCalculator $meetingLoad,
        TimeblockHealthSignalCalculator $timeblockHealth,
        TaskRiskSignalCalculator $taskRisk,
        CaptureActivitySignalCalculator $captureActivity,
        MigrationStateSignalCalculator $migrationState,
        CalendarSyncHealthSignalCalculator $calendarSyncHealth,
        BirthdayOrSpecialSignalCalculator $birthdayOrSpecial,
        CompletionTrendSignalCalculator $completionTrend,
    ) {
        $this->calculators = [
            $meetingLoad,
            $timeblockHealth,
            $taskRisk,
            $captureActivity,
            $migrationState,
            $calendarSyncHealth,
            $birthdayOrSpecial,
            $completionTrend,
        ];
    }

    /**
     * @return Collection<int, WorkspaceDailySignal>
     */
    public function recalculateDate(Workspace $workspace, CarbonInterface $date): Collection
    {
        $signalDate = $date->toDateString();
        $keys = [];
        $upsertRows = [];
        $timestamp = now();

        foreach ($this->calculators as $calculator) {
            $result = $calculator->calculate($workspace, $date);
            $keys[] = $result->key;
            $upsertRows[] = [
                'workspace_id' => $workspace->id,
                'date' => $signalDate,
                'signal_key' => $result->key,
                'state' => $result->state,
                'value_json' => json_encode($result->value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'created_at' => $timestamp,
                'updated_at' => $timestamp,
            ];
        }

        if ($upsertRows !== []) {
            WorkspaceDailySignal::query()->upsert(
                $upsertRows,
                ['workspace_id', 'date', 'signal_key'],
                ['state', 'value_json', 'updated_at'],
            );
        }

        WorkspaceDailySignal::query()
            ->where('workspace_id', $workspace->id)
            ->whereDate('date', $signalDate)
            ->whereNotIn('signal_key', $keys)
            ->delete();

        return WorkspaceDailySignal::query()
            ->where('workspace_id', $workspace->id)
            ->whereDate('date', $signalDate)
            ->get();
    }
}
