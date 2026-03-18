<?php

use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\Event;
use App\Models\Note;
use App\Models\User;
use App\Services\CalDavService;
use Illuminate\Support\Str;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->workspace = $this->user->currentWorkspace();
    $this->service = app(CalDavService::class);

    $this->calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'Test Calendar',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $this->rangeStart = now()->subDays(7)->startOfDay();
    $this->rangeEnd = now()->addDays(30)->endOfDay();
});

/**
 * Helper: call the private pruneStaleItems method via reflection.
 */
function callPruneStaleItems(
    CalDavService $service,
    Calendar $calendar,
    array $returnedItems,
    \Carbon\CarbonInterface $rangeStart,
    \Carbon\CarbonInterface $rangeEnd,
): void {
    $method = new ReflectionMethod($service, 'pruneStaleItems');
    $method->invoke($service, $calendar, $returnedItems, $rangeStart, $rangeEnd);
}

/**
 * Helper: create a CalendarItem + Event within the sync range.
 *
 * @return array{0: CalendarItem, 1: Event}
 */
function makeCalendarEvent(Calendar $calendar, ?string $uid = null): array
{
    $uid ??= Str::uuid()->toString();

    $item = CalendarItem::query()->create([
        'calendar_id' => $calendar->id,
        'uid' => $uid,
        'etag' => 'abc',
        'href' => "/cal/{$uid}.ics",
        'location' => '',
        'description' => '',
    ]);

    $event = Event::query()->create([
        'workspace_id' => $calendar->workspace_id,
        'eventable_type' => CalendarItem::class,
        'eventable_id' => $item->id,
        'title' => 'Test Event',
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'all_day' => false,
        'timezone' => 'UTC',
    ]);

    return [$item, $event];
}

test('stale event with linked meeting note gets remote_deleted_at set and records are preserved', function () {
    [$item, $event] = makeCalendarEvent($this->calendar);

    Note::factory()->create([
        'workspace_id' => $this->workspace->id,
        'type' => Note::TYPE_MEETING,
        'meta' => ['event_block_id' => $event->id],
    ]);

    // Prune with no returned items — the event's UID is absent.
    callPruneStaleItems($this->service, $this->calendar, [], $this->rangeStart, $this->rangeEnd);

    expect($event->fresh()->remote_deleted_at)->not()->toBeNull();
    expect(CalendarItem::find($item->id))->not()->toBeNull();
});

test('stale event without a linked meeting note is hard-deleted', function () {
    [$item, $event] = makeCalendarEvent($this->calendar);

    callPruneStaleItems($this->service, $this->calendar, [], $this->rangeStart, $this->rangeEnd);

    expect(Event::find($event->id))->toBeNull();
    expect(CalendarItem::find($item->id))->toBeNull();
});

test('stale event linked via block_id gets remote_deleted_at set', function () {
    $blockId = Str::uuid()->toString();

    [$item, $event] = makeCalendarEvent($this->calendar);
    $event->update(['block_id' => $blockId]);

    Note::factory()->create([
        'workspace_id' => $this->workspace->id,
        'type' => Note::TYPE_MEETING,
        'meta' => ['event_block_id' => $blockId],
    ]);

    callPruneStaleItems($this->service, $this->calendar, [], $this->rangeStart, $this->rangeEnd);

    expect($event->fresh()->remote_deleted_at)->not()->toBeNull();
    expect(CalendarItem::find($item->id))->not()->toBeNull();
});

test('stale meeting note linked to deleted_at note is hard-deleted', function () {
    [$item, $event] = makeCalendarEvent($this->calendar);

    $note = Note::factory()->create([
        'workspace_id' => $this->workspace->id,
        'type' => Note::TYPE_MEETING,
        'meta' => ['event_block_id' => $event->id],
    ]);
    $note->delete(); // soft-deleted — should not count as "linked"

    callPruneStaleItems($this->service, $this->calendar, [], $this->rangeStart, $this->rangeEnd);

    expect(Event::find($event->id))->toBeNull();
    expect(CalendarItem::find($item->id))->toBeNull();
});

test('event whose uid is returned by remote is not pruned', function () {
    $uid = Str::uuid()->toString();
    [$item, $event] = makeCalendarEvent($this->calendar, $uid);

    // Return the UID so it is NOT considered stale.
    $returnedItems = [
        ['uid' => $uid, 'href' => "/cal/{$uid}.ics", 'etag' => 'abc', 'ical' => '', 'vevent' => null],
    ];

    callPruneStaleItems($this->service, $this->calendar, $returnedItems, $this->rangeStart, $this->rangeEnd);

    expect(Event::find($event->id))->not()->toBeNull();
    expect(CalendarItem::find($item->id))->not()->toBeNull();
    expect($event->fresh()->remote_deleted_at)->toBeNull();
});

test('event outside the sync range is not affected by pruning', function () {
    [$item, $event] = makeCalendarEvent($this->calendar);
    // Move the event far in the future, outside rangeEnd.
    $event->update(['starts_at' => now()->addDays(90)]);

    callPruneStaleItems($this->service, $this->calendar, [], $this->rangeStart, $this->rangeEnd);

    expect(Event::find($event->id))->not()->toBeNull();
});

test('reappearing event gets remote_deleted_at cleared via upsert', function () {
    $uid = Str::uuid()->toString();
    [$item, $event] = makeCalendarEvent($this->calendar, $uid);

    // Mark the event as remotely deleted.
    $event->update(['remote_deleted_at' => now()->subDay()]);

    // Simulate upsert (the event reappears on the remote).
    $method = new ReflectionMethod($this->service, 'upsertCalendarItem');
    $vevent = new class
    {
        public $SUMMARY = 'Test Event';

        public $DTSTART;

        public $DTEND;

        public function __construct()
        {
            $this->DTSTART = new class
            {
                public function getValueType(): string
                {
                    return 'DATE-TIME';
                }

                public function getDateTime(): \DateTimeInterface
                {
                    return new \DateTime('tomorrow');
                }
            };
            $this->DTEND = new class
            {
                public function getValueType(): string
                {
                    return 'DATE-TIME';
                }

                public function getDateTime(): \DateTimeInterface
                {
                    return new \DateTime('tomorrow +1 hour');
                }
            };
        }
    };

    $method->invoke($this->service, $this->calendar, [
        'uid' => $uid,
        'href' => "/cal/{$uid}.ics",
        'etag' => 'new-etag',
        'ical' => '',
        'vevent' => $vevent,
    ]);

    expect($event->fresh()->remote_deleted_at)->toBeNull();
});

test('syncPeriod skips pruning when the remote server is unreachable', function () {
    [$item, $event] = makeCalendarEvent($this->calendar);

    // Point the calendar at a URL that refuses connections instantly.
    $badCalendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'Bad Calendar',
        'provider' => 'caldav',
        'url' => 'http://127.0.0.1:1/',
        'username' => 'u',
        'password' => 'p',
        'is_active' => true,
    ]);

    // Move the event to the bad calendar so prune would target it.
    $item->update(['calendar_id' => $badCalendar->id]);
    $event->update(['workspace_id' => $badCalendar->workspace_id]);

    $this->service->syncPeriod($badCalendar, now()->format('Y-m'));

    // Items must survive because fetchRemoteItems returned null.
    expect(Event::find($event->id))->not()->toBeNull();
    expect(CalendarItem::find($item->id))->not()->toBeNull();
});
