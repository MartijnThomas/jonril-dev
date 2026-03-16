<?php

namespace App\Listeners;

use App\Jobs\SyncCalendarJob;
use App\Models\Calendar;
use Illuminate\Auth\Events\Login;

class SyncUserCalendarsOnLogin
{
    public function handle(Login $event): void
    {
        $user = $event->user;

        $workspaceIds = $user->workspaces()->pluck('workspaces.id');

        if ($workspaceIds->isEmpty()) {
            return;
        }

        Calendar::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->where('is_active', true)
            ->orderBy('last_synced_at')
            ->each(function (Calendar $calendar): void {
                SyncCalendarJob::dispatch($calendar);
            });
    }
}
