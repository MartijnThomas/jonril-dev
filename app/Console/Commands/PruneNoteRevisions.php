<?php

namespace App\Console\Commands;

use App\Models\NoteRevision;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class PruneNoteRevisions extends Command
{
    protected $signature = 'notes:prune-revisions';

    protected $description = 'Prune note revisions according to configured retention strategy';

    public function handle(): int
    {
        $deleted = 0;

        NoteRevision::query()
            ->select('note_id')
            ->distinct()
            ->orderBy('note_id')
            ->chunk(200, function ($items) use (&$deleted): void {
                foreach ($items as $item) {
                    $deleted += $this->pruneForNote($item->note_id);
                }
            });

        $this->info("Pruned {$deleted} note revisions.");

        return self::SUCCESS;
    }

    private function pruneForNote(string $noteId): int
    {
        $revisions = NoteRevision::query()
            ->where('note_id', $noteId)
            ->orderByDesc('created_at')
            ->get(['id', 'created_at']);

        if ($revisions->isEmpty()) {
            return 0;
        }

        $keepAllForHours = (int) config('note-revisions.retention.keep_all_for_hours', 48);
        $keepHourlyForDays = (int) config('note-revisions.retention.keep_hourly_for_days', 7);
        $keepDailyForDays = (int) config('note-revisions.retention.keep_daily_for_days', 30);
        $keepWeeklyForWeeks = (int) config('note-revisions.retention.keep_weekly_for_weeks', 26);
        $keepMonthlyForMonths = (int) config('note-revisions.retention.keep_monthly_for_months', 12);

        $now = now();
        $keepIds = [];
        $hourlyBuckets = [];
        $dailyBuckets = [];
        $weeklyBuckets = [];
        $monthlyBuckets = [];
        $yearlyBuckets = [];

        foreach ($revisions as $revision) {
            $ageHours = $revision->created_at->diffInHours($now);
            $ageDays = $revision->created_at->diffInDays($now);
            $ageWeeks = (int) floor($ageDays / 7);
            $ageMonths = $revision->created_at->diffInMonths($now);

            if ($ageHours <= $keepAllForHours) {
                $keepIds[] = $revision->id;

                continue;
            }

            if ($ageDays <= $keepHourlyForDays) {
                $bucket = $revision->created_at->format('Y-m-d-H');
                if (! isset($hourlyBuckets[$bucket])) {
                    $hourlyBuckets[$bucket] = true;
                    $keepIds[] = $revision->id;
                }

                continue;
            }

            if ($ageDays <= $keepDailyForDays) {
                $bucket = $revision->created_at->toDateString();
                if (! isset($dailyBuckets[$bucket])) {
                    $dailyBuckets[$bucket] = true;
                    $keepIds[] = $revision->id;
                }

                continue;
            }

            if ($ageWeeks <= $keepWeeklyForWeeks) {
                $bucket = Carbon::parse($revision->created_at)->format('o-W');
                if (! isset($weeklyBuckets[$bucket])) {
                    $weeklyBuckets[$bucket] = true;
                    $keepIds[] = $revision->id;
                }

                continue;
            }

            if ($ageMonths <= $keepMonthlyForMonths) {
                $bucket = $revision->created_at->format('Y-m');
                if (! isset($monthlyBuckets[$bucket])) {
                    $monthlyBuckets[$bucket] = true;
                    $keepIds[] = $revision->id;
                }

                continue;
            }

            // Beyond the monthly window: keep one revision per year indefinitely.
            $bucket = $revision->created_at->format('Y');
            if (! isset($yearlyBuckets[$bucket])) {
                $yearlyBuckets[$bucket] = true;
                $keepIds[] = $revision->id;
            }
        }

        $deleteQuery = NoteRevision::query()->where('note_id', $noteId);

        if ($keepIds !== []) {
            $deleteQuery->whereNotIn('id', $keepIds);
        }

        return $deleteQuery->delete();
    }
}
