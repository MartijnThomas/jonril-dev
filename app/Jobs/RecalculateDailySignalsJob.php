<?php

namespace App\Jobs;

use App\Models\Workspace;
use App\Support\DailySignals\DailySignalPipeline;
use App\Support\DailySignals\IndicatorProjectionService;
use Carbon\Carbon;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class RecalculateDailySignalsJob implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<int, string>  $dates
     */
    public function __construct(
        public readonly string $workspaceId,
        public readonly array $dates,
    ) {}

    public function handle(
        DailySignalPipeline $pipeline,
        IndicatorProjectionService $projection,
    ): void {
        $workspace = Workspace::query()->find($this->workspaceId);
        if (! $workspace) {
            return;
        }

        $normalizedDates = collect($this->dates)
            ->filter(fn ($date) => is_string($date) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1)
            ->map(fn (string $date) => trim($date))
            ->unique()
            ->values();

        foreach ($normalizedDates as $date) {
            $dateObject = Carbon::createFromFormat('Y-m-d', $date, 'UTC')->startOfDay();
            $pipeline->recalculateDate($workspace, $dateObject);
            $projection->projectDate($workspace, $dateObject);
        }
    }
}
