<?php

namespace App\Console\Commands;

use App\Jobs\SyncCalendarJob;
use App\Models\Calendar;
use Illuminate\Console\Command;

class SyncCalendarsCommand extends Command
{
    protected $signature = 'calendars:sync {--workspace= : Sync only calendars for the given workspace ID}';

    protected $description = 'Sync all active CalDAV calendars (or those belonging to a specific workspace)';

    public function handle(): int
    {
        $query = Calendar::query()->where('is_active', true);

        if ($workspaceId = $this->option('workspace')) {
            $query->where('workspace_id', $workspaceId);
        }

        $count = 0;

        $query->orderBy('last_synced_at')->chunk(50, function ($calendars) use (&$count): void {
            foreach ($calendars as $calendar) {
                SyncCalendarJob::dispatch($calendar);
                $count++;
            }
        });

        $this->info("Dispatched sync jobs for {$count} calendar(s).");

        return self::SUCCESS;
    }
}
