<?php

use App\Jobs\SyncTimeblockCreateJob;
use App\Jobs\SyncTimeblockDeleteJob;
use App\Jobs\SyncTimeblockUpdateJob;
use App\Models\Calendar;
use App\Models\TimeblockCalendarLink;
use App\Models\Workspace;
use Illuminate\Support\Facades\Bus;

test('timeblocks sync outbound command dispatches jobs by pending status', function (): void {
    Bus::fake();

    $workspace = Workspace::factory()->create();
    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Primary',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/user/primary/',
        'username' => 'user@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $create = TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_CREATE,
    ]);

    $update = TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_UPDATE,
    ]);

    $delete = TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_DELETE,
    ]);

    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_SYNCED,
    ]);

    $this->artisan('timeblocks:sync-outbound')
        ->expectsOutputToContain('Dispatched 3 outbound timeblock sync job(s).')
        ->assertExitCode(0);

    Bus::assertDispatched(SyncTimeblockCreateJob::class, fn (SyncTimeblockCreateJob $job) => $job->timeblockCalendarLinkId === $create->id);
    Bus::assertDispatched(SyncTimeblockUpdateJob::class, fn (SyncTimeblockUpdateJob $job) => $job->timeblockCalendarLinkId === $update->id);
    Bus::assertDispatched(SyncTimeblockDeleteJob::class, fn (SyncTimeblockDeleteJob $job) => $job->timeblockCalendarLinkId === $delete->id);
});

test('timeblocks sync outbound command supports calendar and workspace filters', function (): void {
    Bus::fake();

    $workspaceA = Workspace::factory()->create();
    $workspaceB = Workspace::factory()->create();
    $calendarA = Calendar::query()->create([
        'workspace_id' => $workspaceA->id,
        'name' => 'A',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/a/',
        'username' => 'a@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);
    $calendarB = Calendar::query()->create([
        'workspace_id' => $workspaceB->id,
        'name' => 'B',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/b/',
        'username' => 'b@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $allowed = TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspaceA->id,
        'calendar_id' => $calendarA->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_CREATE,
    ]);

    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspaceB->id,
        'calendar_id' => $calendarB->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_CREATE,
    ]);

    $this->artisan('timeblocks:sync-outbound', [
        '--workspace' => $workspaceA->id,
        '--calendar' => $calendarA->id,
    ])
        ->expectsOutputToContain('Dispatched 1 outbound timeblock sync job(s).')
        ->assertExitCode(0);

    Bus::assertDispatched(SyncTimeblockCreateJob::class, fn (SyncTimeblockCreateJob $job) => $job->timeblockCalendarLinkId === $allowed->id);
    Bus::assertDispatched(SyncTimeblockCreateJob::class, 1);
});
