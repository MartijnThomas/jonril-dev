<?php

use App\Models\Calendar;
use App\Models\Event;
use App\Models\Timeblock;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Services\CalDavService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Sabre\DAV\Client;

uses(RefreshDatabase::class);

class TestableCalDavService extends CalDavService
{
    public function __construct(private readonly Client $client) {}

    protected function makeClient(string $url, string $username, string $password): Client
    {
        return $this->client;
    }
}

function makeOutboundSyncModels(): array
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
        'location' => 'HQ, Floor 2',
    ]);

    $event = Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $timeblock->id,
        'title' => 'Planning; Q2',
        'starts_at' => '2026-03-21 09:00:00',
        'ends_at' => '2026-03-21 10:00:00',
        'timezone' => 'Europe/Amsterdam',
    ]);

    return [$calendar, $timeblock, $event];
}

test('createTimeblockEvent sends expected payload and returns trimmed etag', function () {
    [$calendar, $timeblock, $event] = makeOutboundSyncModels();

    $client = Mockery::mock(Client::class);
    $client->shouldReceive('request')
        ->once()
        ->withArgs(function (string $method, string $href, string $body, array $headers) use ($event): bool {
            expect($method)->toBe('PUT');
            expect($href)->toBe('https://caldav.example.com/user/primary/jonril-timeblock-'.$event->id.'.ics');
            expect($headers['Content-Type'] ?? null)->toBe('text/calendar; charset=utf-8');
            expect($body)->toContain("UID:jonril-timeblock-{$event->id}");
            expect($body)->toContain("X-JONRIL-EVENT-ID:{$event->id}");
            expect($body)->toContain('SUMMARY:Planning\; Q2');
            expect($body)->toContain('LOCATION:HQ\, Floor 2');

            return true;
        })
        ->andReturn([
            'statusCode' => 201,
            'headers' => ['etag' => '"abc123"'],
            'body' => '',
        ]);

    $service = new TestableCalDavService($client);

    $result = $service->createTimeblockEvent(
        $calendar,
        $event,
        $timeblock,
        "jonril-timeblock-{$event->id}",
    );

    expect($result['uid'])->toBe("jonril-timeblock-{$event->id}");
    expect($result['href'])->toBe('https://caldav.example.com/user/primary/jonril-timeblock-'.$event->id.'.ics');
    expect($result['etag'])->toBe('abc123');
});

test('updateTimeblockEvent uses remote href and if-match etag header', function () {
    [$calendar, $timeblock, $event] = makeOutboundSyncModels();

    $link = TimeblockCalendarLink::query()->create([
        'workspace_id' => $calendar->workspace_id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => $event->id,
        'timeblock_id' => $timeblock->id,
        'remote_uid' => 'uid-123',
        'remote_href' => 'https://caldav.example.com/user/primary/uid-123.ics',
        'remote_etag' => 'etag-old',
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_UPDATE,
    ]);

    $client = Mockery::mock(Client::class);
    $client->shouldReceive('request')
        ->once()
        ->withArgs(function (string $method, string $href, string $body, array $headers): bool {
            expect($method)->toBe('PUT');
            expect($href)->toBe('https://caldav.example.com/user/primary/uid-123.ics');
            expect($headers['If-Match'] ?? null)->toBe('etag-old');
            expect($body)->toContain('UID:uid-123');

            return true;
        })
        ->andReturn([
            'statusCode' => 200,
            'headers' => ['ETag' => ['"etag-new"']],
            'body' => '',
        ]);

    $service = new TestableCalDavService($client);

    $result = $service->updateTimeblockEvent($calendar, $link, $event, $timeblock);

    expect($result['uid'])->toBe('uid-123');
    expect($result['href'])->toBe('https://caldav.example.com/user/primary/uid-123.ics');
    expect($result['etag'])->toBe('etag-new');
});

test('deleteTimeblockEvent skips request when remote href is missing', function () {
    [$calendar, $timeblock, $event] = makeOutboundSyncModels();

    $link = TimeblockCalendarLink::query()->create([
        'workspace_id' => $calendar->workspace_id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => $event->id,
        'timeblock_id' => $timeblock->id,
        'remote_uid' => 'uid-123',
        'remote_href' => null,
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_DELETE,
    ]);

    $client = Mockery::mock(Client::class);
    $client->shouldNotReceive('request');

    $service = new TestableCalDavService($client);
    $service->deleteTimeblockEvent($calendar, $link);

    expect(true)->toBeTrue();
});

test('deleteTimeblockEvent sends if-match and treats 404 as success', function () {
    [$calendar, $timeblock, $event] = makeOutboundSyncModels();

    $link = TimeblockCalendarLink::query()->create([
        'workspace_id' => $calendar->workspace_id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => $event->id,
        'timeblock_id' => $timeblock->id,
        'remote_uid' => 'uid-123',
        'remote_href' => 'https://caldav.example.com/user/primary/uid-123.ics',
        'remote_etag' => 'etag-old',
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_DELETE,
    ]);

    $client = Mockery::mock(Client::class);
    $client->shouldReceive('request')
        ->once()
        ->withArgs(function (string $method, string $href, $body, array $headers): bool {
            expect($method)->toBe('DELETE');
            expect($href)->toBe('https://caldav.example.com/user/primary/uid-123.ics');
            expect($headers['If-Match'] ?? null)->toBe('etag-old');

            return true;
        })
        ->andReturn([
            'statusCode' => 404,
            'headers' => [],
            'body' => '',
        ]);

    $service = new TestableCalDavService($client);
    $service->deleteTimeblockEvent($calendar, $link);

    expect(true)->toBeTrue();
});
