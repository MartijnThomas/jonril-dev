<?php

namespace App\Console\Commands;

use App\Jobs\RecalculateDailySignalsJob;
use App\Models\Event;
use App\Models\Note;
use App\Models\NoteTask;
use App\Models\Workspace;
use App\Support\System\ScheduledCommandHealthStore;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;

class BackfillDailySignalsCommand extends Command
{
    protected $signature = 'daily-signals:backfill
        {--workspace= : Workspace UUID or slug}
        {--from= : Start date (YYYY-MM-DD)}
        {--to= : End date (YYYY-MM-DD)}
        {--chunk=14 : Number of days per recalculation job}
        {--sync : Execute recalculation synchronously}';

    protected $description = 'Backfill daily signals and indicator projection for a date range.';

    public function handle(): int
    {
        $context = [
            'label' => 'Daily signals backfill',
            'command' => 'daily-signals:backfill',
            'timezone' => config('app.timezone', 'UTC'),
        ];
        ScheduledCommandHealthStore::markStarted('daily_signals_backfill', $context);

        try {
            [$fromDate, $toDate] = $this->resolveDateRange();
            if (! $fromDate || ! $toDate) {
                $this->warn('No data available to backfill daily signals.');
                ScheduledCommandHealthStore::markSuccess('daily_signals_backfill', [
                    ...$context,
                    'output' => 'No data available to backfill.',
                ]);

                return self::SUCCESS;
            }

            $workspaces = $this->targetWorkspaces();
            if ($workspaces->isEmpty()) {
                $this->warn('No target workspaces found.');
                ScheduledCommandHealthStore::markSuccess('daily_signals_backfill', [
                    ...$context,
                    'output' => 'No target workspaces found.',
                ]);

                return self::SUCCESS;
            }

            $chunkSize = max(1, (int) $this->option('chunk'));
            $sync = (bool) $this->option('sync');
            $dateChunks = collect($this->buildDateRange($fromDate, $toDate))->chunk($chunkSize);
            $jobCount = 0;

            foreach ($workspaces as $workspace) {
                foreach ($dateChunks as $chunk) {
                    $dates = $chunk->values()->all();
                    if ($dates === []) {
                        continue;
                    }

                    if ($sync) {
                        RecalculateDailySignalsJob::dispatchSync($workspace->id, $dates);
                    } else {
                        RecalculateDailySignalsJob::dispatch($workspace->id, $dates);
                    }
                    $jobCount++;
                }
            }

            $summary = sprintf(
                'Backfill dispatched for %d workspace(s), %d day(s), %d job(s).',
                $workspaces->count(),
                count($this->buildDateRange($fromDate, $toDate)),
                $jobCount,
            );
            $this->info($summary);

            ScheduledCommandHealthStore::markSuccess('daily_signals_backfill', [
                ...$context,
                'output' => $summary,
            ]);

            return self::SUCCESS;
        } catch (\Throwable $e) {
            ScheduledCommandHealthStore::markFailure('daily_signals_backfill', [
                ...$context,
                'output' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    /**
     * @return array{0: CarbonImmutable|null, 1: CarbonImmutable|null}
     */
    private function resolveDateRange(): array
    {
        $explicitFrom = $this->parseDate((string) $this->option('from'));
        $explicitTo = $this->parseDate((string) $this->option('to'));

        if ($explicitFrom && $explicitTo) {
            return [$explicitFrom, $explicitTo];
        }

        $workspaceIds = $this->targetWorkspaces()->pluck('id')->all();
        if ($workspaceIds === []) {
            return [null, null];
        }

        $notesMin = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('journal_date')
            ->min('journal_date');
        $eventsMin = Event::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('starts_at')
            ->min('starts_at');
        $tasksMin = NoteTask::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('due_date')
            ->min('due_date');
        $tasksDeadlineMin = NoteTask::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('deadline_date')
            ->min('deadline_date');

        $notesMax = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('journal_date')
            ->max('journal_date');
        $eventsMax = Event::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('ends_at')
            ->max('ends_at');
        $tasksMax = NoteTask::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('due_date')
            ->max('due_date');
        $tasksDeadlineMax = NoteTask::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereNotNull('deadline_date')
            ->max('deadline_date');

        $minCandidates = collect([$explicitFrom?->toDateString(), $notesMin, $eventsMin, $tasksMin, $tasksDeadlineMin])
            ->filter(fn ($value): bool => is_string($value) && trim($value) !== '')
            ->map(fn (string $value): ?CarbonImmutable => $this->parseDate($value))
            ->filter();
        $maxCandidates = collect([$explicitTo?->toDateString(), $notesMax, $eventsMax, $tasksMax, $tasksDeadlineMax])
            ->filter(fn ($value): bool => is_string($value) && trim($value) !== '')
            ->map(fn (string $value): ?CarbonImmutable => $this->parseDate($value))
            ->filter();

        $from = $explicitFrom ?? $minCandidates->sort()->first();
        $to = $explicitTo ?? $maxCandidates->sort()->last();

        return [$from, $to];
    }

    /**
     * @return EloquentCollection<int, Workspace>
     */
    private function targetWorkspaces(): EloquentCollection
    {
        $workspaceOption = trim((string) $this->option('workspace'));

        $query = Workspace::query()
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

    private function parseDate(string $input): ?CarbonImmutable
    {
        $value = trim($input);
        if ($value === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($value)->startOfDay();
        } catch (\Throwable) {
            return null;
        }
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
