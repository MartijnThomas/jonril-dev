<?php

namespace App\Console\Commands;

use App\Jobs\RecalculateDailySignalsJob;
use App\Models\Workspace;
use App\Support\System\ScheduledCommandHealthStore;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

class ReconcileDailySignalsCommand extends Command
{
    protected $signature = 'daily-signals:reconcile
        {--workspace= : Workspace UUID or slug}
        {--days-back=14 : Number of days in the past to reconcile}
        {--days-forward=90 : Number of days in the future to reconcile}
        {--chunk=14 : Number of days per recalculation job}
        {--sync : Execute recalculation synchronously}';

    protected $description = 'Reconcile daily signals for the active operational date window.';

    public function handle(): int
    {
        $context = [
            'label' => 'Daily signals reconcile',
            'command' => 'daily-signals:reconcile',
            'timezone' => config('app.timezone', 'UTC'),
        ];
        ScheduledCommandHealthStore::markStarted('daily_signals_reconcile', $context);

        try {
            $workspaces = $this->targetWorkspaces();
            if ($workspaces->isEmpty()) {
                $this->warn('No target workspaces found.');
                ScheduledCommandHealthStore::markSuccess('daily_signals_reconcile', [
                    ...$context,
                    'output' => 'No target workspaces found.',
                ]);

                return self::SUCCESS;
            }

            $daysBack = max(0, (int) $this->option('days-back'));
            $daysForward = max(0, (int) $this->option('days-forward'));
            $chunkSize = max(1, (int) $this->option('chunk'));
            $sync = (bool) $this->option('sync');

            $from = CarbonImmutable::now()->subDays($daysBack)->startOfDay();
            $to = CarbonImmutable::now()->addDays($daysForward)->startOfDay();
            $dates = $this->buildDateRange($from, $to);
            $dateChunks = collect($dates)->chunk($chunkSize);
            $jobCount = 0;

            foreach ($workspaces as $workspace) {
                foreach ($dateChunks as $chunk) {
                    $chunkDates = $chunk->values()->all();
                    if ($chunkDates === []) {
                        continue;
                    }

                    if ($sync) {
                        RecalculateDailySignalsJob::dispatchSync($workspace->id, $chunkDates);
                    } else {
                        RecalculateDailySignalsJob::dispatch($workspace->id, $chunkDates);
                    }
                    $jobCount++;
                }
            }

            $summary = sprintf(
                'Reconcile dispatched for %d workspace(s), %d day(s), %d job(s).',
                $workspaces->count(),
                count($dates),
                $jobCount,
            );
            $this->info($summary);

            ScheduledCommandHealthStore::markSuccess('daily_signals_reconcile', [
                ...$context,
                'output' => $summary,
            ]);

            return self::SUCCESS;
        } catch (\Throwable $e) {
            ScheduledCommandHealthStore::markFailure('daily_signals_reconcile', [
                ...$context,
                'output' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * @return EloquentCollection<int, Workspace>
     */
    private function targetWorkspaces(): EloquentCollection
    {
        $workspaceOption = trim((string) $this->option('workspace'));

        $query = Workspace::query()
            ->where('is_personal', true)
            ->whereNull('migrated_at');

        if ($workspaceOption === '') {
            return $query->get(['id', 'slug']);
        }

        return $query
            ->where(function ($inner) use ($workspaceOption): void {
                $inner->where('id', $workspaceOption)
                    ->orWhere('slug', $workspaceOption);
            })
            ->get(['id', 'slug']);
    }

    /**
     * @return array<int, string>
     */
    private function buildDateRange(CarbonImmutable $from, CarbonImmutable $to): array
    {
        if ($to->lt($from)) {
            [$from, $to] = [$to, $from];
        }

        $dates = [];
        for ($cursor = $from; $cursor->lte($to); $cursor = $cursor->addDay()) {
            $dates[] = $cursor->toDateString();
        }

        return $dates;
    }
}
