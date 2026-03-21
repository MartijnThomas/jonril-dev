<?php

use App\Jobs\SyncTimeblockUpdateJob;
use App\Models\Calendar;
use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Services\CalDavService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function makeTimeblockSyncModels(): array
{
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Primary',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/user/primary/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $timeblock = Timeblock::query()->create([
        'location' => 'HQ',
    ]);
    $note = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Sync source',
    ]);

    $event = Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $timeblock->id,
        'title' => 'Planning',
        'starts_at' => '2026-03-21 09:00:00',
        'ends_at' => '2026-03-21 10:00:00',
        'timezone' => 'Europe/Amsterdam',
        'note_id' => $note->id,
    ]);

    $link = TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) $event->note_id,
        'event_id' => (string) $event->id,
        'timeblock_id' => (string) $timeblock->id,
        'remote_uid' => 'uid-test',
        'remote_href' => 'https://caldav.example.com/user/primary/uid-test.ics',
        'remote_etag' => 'etag-old',
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_UPDATE,
    ]);

    return [$calendar, $timeblock, $event, $link];
}

test('sync timeblock update job does not throw in sync queue mode and marks link as failed', function (): void {
    [, , , $link] = makeTimeblockSyncModels();

    config()->set('queue.default', 'sync');

    $service = Mockery::mock(CalDavService::class);
    $service->shouldReceive('updateTimeblockEvent')
        ->once()
        ->andThrow(new RuntimeException('CalDAV update failed with status 412'));

    $job = new SyncTimeblockUpdateJob((string) $link->id);
    $job->handle($service);

    $link->refresh();

    expect($link->sync_status)->toBe(TimeblockCalendarLink::STATUS_FAILED);
    expect((string) $link->last_error)->toContain('status 412');
});

test('sync timeblock update job still throws in async queue mode for retries', function (): void {
    [, , , $link] = makeTimeblockSyncModels();

    config()->set('queue.default', 'database');

    $service = Mockery::mock(CalDavService::class);
    $service->shouldReceive('updateTimeblockEvent')
        ->once()
        ->andThrow(new RuntimeException('CalDAV update failed with status 412'));

    $job = new SyncTimeblockUpdateJob((string) $link->id);

    expect(fn () => $job->handle($service))
        ->toThrow(RuntimeException::class, 'status 412');

    $link->refresh();

    expect($link->sync_status)->toBe(TimeblockCalendarLink::STATUS_FAILED);
    expect((string) $link->last_error)->toContain('status 412');
});
