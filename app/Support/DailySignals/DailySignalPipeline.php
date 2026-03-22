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

        foreach ($this->calculators as $calculator) {
            $result = $calculator->calculate($workspace, $date);
            $keys[] = $result->key;

            $existing = WorkspaceDailySignal::query()
                ->where('workspace_id', $workspace->id)
                ->whereDate('date', $signalDate)
                ->where('signal_key', $result->key)
                ->first();

            if ($existing !== null) {
                $existing->update([
                    'state' => $result->state,
                    'value_json' => $result->value,
                ]);
            } else {
                WorkspaceDailySignal::query()->create([
                    'workspace_id' => $workspace->id,
                    'date' => $signalDate,
                    'signal_key' => $result->key,
                    'state' => $result->state,
                    'value_json' => $result->value,
                ]);
            }
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
