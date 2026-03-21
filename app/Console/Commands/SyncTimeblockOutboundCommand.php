<?php

namespace App\Console\Commands;

use App\Jobs\SyncTimeblockCreateJob;
use App\Jobs\SyncTimeblockDeleteJob;
use App\Jobs\SyncTimeblockUpdateJob;
use App\Models\TimeblockCalendarLink;
use Illuminate\Console\Command;

class SyncTimeblockOutboundCommand extends Command
{
    protected $signature = 'timeblocks:sync-outbound
        {--workspace= : Only process links for this workspace}
        {--calendar= : Only process links for this calendar}
        {--limit=200 : Maximum number of pending links to dispatch}';

    protected $description = 'Dispatch outbound sync jobs for pending timeblock calendar link changes';

    public function handle(): int
    {
        $limit = max(1, min(1000, (int) $this->option('limit')));

        $query = TimeblockCalendarLink::query()
            ->whereIn('sync_status', [
                TimeblockCalendarLink::STATUS_PENDING_CREATE,
                TimeblockCalendarLink::STATUS_PENDING_UPDATE,
                TimeblockCalendarLink::STATUS_PENDING_DELETE,
            ])
            ->orderBy('updated_at')
            ->limit($limit);

        if ($workspaceId = $this->option('workspace')) {
            $query->where('workspace_id', $workspaceId);
        }

        if ($calendarId = $this->option('calendar')) {
            $query->where('calendar_id', $calendarId);
        }

        $links = $query->get(['id', 'sync_status']);
        $dispatched = 0;

        foreach ($links as $link) {
            if ($link->sync_status === TimeblockCalendarLink::STATUS_PENDING_CREATE) {
                SyncTimeblockCreateJob::dispatch($link->id);
                $dispatched++;

                continue;
            }

            if ($link->sync_status === TimeblockCalendarLink::STATUS_PENDING_UPDATE) {
                SyncTimeblockUpdateJob::dispatch($link->id);
                $dispatched++;

                continue;
            }

            if ($link->sync_status === TimeblockCalendarLink::STATUS_PENDING_DELETE) {
                SyncTimeblockDeleteJob::dispatch($link->id);
                $dispatched++;
            }
        }

        $this->info("Dispatched {$dispatched} outbound timeblock sync job(s).");

        return self::SUCCESS;
    }
}
