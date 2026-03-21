<?php

namespace App\Console\Commands;

use App\Models\Calendar;
use App\Models\CalendarConnection;
use App\Models\Workspace;
use App\Support\Calendars\CalendarConnectionResolver;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class NormalizeCalendarConnectionsCommand extends Command
{
    protected $signature = 'calendars:normalize-connections {--workspace=}';

    protected $description = 'Ensure each workspace calendars are attached to one canonical provider connection.';

    public function __construct(private readonly CalendarConnectionResolver $resolver)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $workspaceId = $this->option('workspace');

        $workspaces = Workspace::query()
            ->when(
                is_string($workspaceId) && trim($workspaceId) !== '',
                fn ($query) => $query->where('id', trim((string) $workspaceId)),
            )
            ->whereHas('calendars')
            ->get();

        $workspaceCount = 0;
        $connectionCreated = 0;
        $connectionRemoved = 0;
        $calendarUpdated = 0;

        foreach ($workspaces as $workspace) {
            $workspaceCount++;

            DB::transaction(function () use (
                $workspace,
                &$connectionCreated,
                &$connectionRemoved,
                &$calendarUpdated,
            ): void {
                $calendars = Calendar::query()
                    ->where('workspace_id', $workspace->id)
                    ->with('connection')
                    ->orderBy('created_at')
                    ->get();

                if ($calendars->isEmpty()) {
                    return;
                }

                $canonicalConnection = $calendars
                    ->pluck('connection')
                    ->filter()
                    ->first();

                if (! $canonicalConnection) {
                    $first = $calendars->first();

                    $canonicalConnection = CalendarConnection::query()->create([
                        'workspace_id' => $workspace->id,
                        'provider' => 'caldav',
                        'server_url' => $this->resolver->normalizeBaseUrl((string) $first->url),
                        'username' => '',
                        'password' => '',
                    ]);

                    $connectionCreated++;
                }

                foreach ($calendars as $calendar) {
                    if ($calendar->calendar_connection_id !== $canonicalConnection->id) {
                        $calendar->forceFill([
                            'calendar_connection_id' => $canonicalConnection->id,
                        ])->save();

                        $calendarUpdated++;
                    }
                }

                $removed = CalendarConnection::query()
                    ->where('workspace_id', $workspace->id)
                    ->where('id', '!=', $canonicalConnection->id)
                    ->whereDoesntHave('calendars')
                    ->delete();

                $connectionRemoved += $removed;
            });
        }

        $this->info("Processed workspaces: {$workspaceCount}");
        $this->info("Connections created: {$connectionCreated}");
        $this->info("Calendars reassigned: {$calendarUpdated}");
        $this->info("Unused connections removed: {$connectionRemoved}");

        return self::SUCCESS;
    }
}
