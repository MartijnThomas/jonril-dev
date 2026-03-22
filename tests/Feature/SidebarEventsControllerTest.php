<?php

use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\Event;
use App\Models\Note;
use App\Models\NoteTask;
use App\Models\Timeblock;
use App\Models\User;
use App\Models\Workspace;
use App\Models\WorkspaceDailyIndicator;
use Carbon\Carbon;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

test('journal page keeps active workspace while sidebar events endpoint can fetch personal workspace events', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $activeWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $activeWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $user->forceFill([
        'settings' => [
            ...(is_array($user->settings) ? $user->settings : []),
            'workspace_id' => $activeWorkspace->id,
        ],
    ])->save();

    $personalTimeblock = Timeblock::query()->create([
        'location' => 'Personal room',
    ]);
    Event::query()->create([
        'workspace_id' => $personalWorkspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $personalTimeblock->id,
        'title' => 'Personal event',
        'starts_at' => '2026-03-07 09:00:00',
        'ends_at' => '2026-03-07 10:00:00',
        'timezone' => 'Europe/Amsterdam',
        'journal_date' => '2026-03-07',
    ]);

    $activeTimeblock = Timeblock::query()->create([
        'location' => 'Team room',
    ]);
    Event::query()->create([
        'workspace_id' => $activeWorkspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $activeTimeblock->id,
        'title' => 'Active workspace event',
        'starts_at' => '2026-03-07 11:00:00',
        'ends_at' => '2026-03-07 12:00:00',
        'timezone' => 'Europe/Amsterdam',
        'journal_date' => '2026-03-07',
    ]);

    $this
        ->actingAs($user->fresh())
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('currentWorkspace.id', $activeWorkspace->id)
            ->where('personalWorkspace.id', $personalWorkspace?->id),
        );

    $response = $this
        ->actingAs($user->fresh())
        ->getJson("/w/{$personalWorkspace->slug}/events?date=2026-03-07")
        ->assertOk();

    $events = collect((array) $response->json('events'));
    expect($events->pluck('title')->all())->toContain('Personal event');
    expect($events->pluck('title')->all())->not->toContain('Active workspace event');
});

test('sidebar events endpoint returns forbidden for non-member workspace', function () {
    $owner = User::factory()->create();
    $outsider = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($outsider)
        ->getJson("/w/{$workspace->slug}/events?date=2026-03-07")
        ->assertForbidden();
});

test('person note birthday property creates all-day birthday event and appears in sidebar for matching date', function () {
    config()->set('queue.default', 'sync');

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $year = (int) now('UTC')->year;

    $note = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Jane Doe',
        'properties' => [
            'type' => 'person',
            'birthday' => '1988-03-22',
        ],
        'content' => [
            'type' => 'doc',
            'content' => [],
        ],
    ]);

    $birthdayEvent = Event::query()
        ->where('note_id', $note->id)
        ->where('eventable_type', Note::class)
        ->where('block_id', 'birthday')
        ->first();

    expect($birthdayEvent)->not->toBeNull();
    expect((bool) $birthdayEvent?->all_day)->toBeTrue();
    expect(data_get($birthdayEvent?->meta, 'event_type'))->toBe('birthday');
    expect(data_get($birthdayEvent?->meta, 'birthday_month'))->toBe(3);
    expect(data_get($birthdayEvent?->meta, 'birthday_day'))->toBe(22);

    $response = $this
        ->actingAs($user)
        ->getJson("/w/{$workspace->slug}/events?date={$year}-03-22")
        ->assertOk();

    $events = collect((array) $response->json('events'));
    $birthday = $events->firstWhere('id', $birthdayEvent?->id);

    expect($birthday)->toBeArray();
    expect(data_get($birthday, 'type'))->toBe('birthday');
    expect((bool) data_get($birthday, 'all_day'))->toBeTrue();
    expect((string) data_get($birthday, 'title'))->toBe('Jane Doe');
    expect((int) data_get($birthday, 'birthday_age'))->toBe($year - 1988);

    $this
        ->actingAs($user)
        ->getJson("/w/{$workspace->slug}/events?date={$year}-03-23")
        ->assertOk()
        ->assertJsonMissing([
            'id' => $birthdayEvent?->id,
        ]);
});

test('birthday event is removed when note is no longer a person birthday note', function () {
    config()->set('queue.default', 'sync');

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Jane Doe',
        'properties' => [
            'type' => 'person',
            'birthday' => '22-03-1988',
        ],
        'content' => [
            'type' => 'doc',
            'content' => [],
        ],
    ]);

    expect(
        Event::query()
            ->where('note_id', $note->id)
            ->where('eventable_type', Note::class)
            ->where('block_id', 'birthday')
            ->exists(),
    )->toBeTrue();

    $note->update([
        'properties' => [
            'type' => 'project',
            'birthday' => '22-03-1988',
        ],
    ]);

    expect(
        Event::query()
            ->where('note_id', $note->id)
            ->where('eventable_type', Note::class)
            ->where('block_id', 'birthday')
            ->exists(),
    )->toBeFalse();
});

test('person birthday property supports month-day format', function () {
    config()->set('queue.default', 'sync');

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $year = (int) now('UTC')->year;

    $note = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'John Doe',
        'properties' => [
            'type' => 'person',
            'birthday' => '03-22',
        ],
        'content' => [
            'type' => 'doc',
            'content' => [],
        ],
    ]);

    $birthdayEvent = Event::query()
        ->where('note_id', $note->id)
        ->where('eventable_type', Note::class)
        ->where('block_id', 'birthday')
        ->first();

    expect($birthdayEvent)->not->toBeNull();
    expect((bool) $birthdayEvent?->all_day)->toBeTrue();
    expect(data_get($birthdayEvent?->meta, 'birthday_month'))->toBe(3);
    expect(data_get($birthdayEvent?->meta, 'birthday_day'))->toBe(22);

    $response = $this
        ->actingAs($user)
        ->getJson("/w/{$workspace->slug}/events?date={$year}-03-22")
        ->assertOk();

    $events = collect((array) $response->json('events'));
    $birthday = $events->firstWhere('id', $birthdayEvent?->id);

    expect($birthday)->toBeArray();
    expect(data_get($birthday, 'type'))->toBe('birthday');
    expect((string) data_get($birthday, 'title'))->toBe('John Doe');
    expect(data_get($birthday, 'birthday_age'))->toBeNull();
});

test('sidebar events include calendar color for non-timeblock calendar events', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Color Calendar',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/calendars/color',
        'username' => 'martijn@example.com',
        'password' => 'secret',
        'color' => '#22c55e',
        'is_active' => true,
    ]);

    $calendarItem = CalendarItem::query()->create([
        'calendar_id' => $calendar->id,
        'uid' => 'color-event-1',
        'etag' => 'etag-1',
        'href' => '/calendars/color/event-1.ics',
        'location' => 'Board room',
        'description' => '',
        'rrule' => null,
        'raw_ical' => null,
    ]);

    Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => CalendarItem::class,
        'eventable_id' => $calendarItem->id,
        'title' => 'Calendar color event',
        'starts_at' => '2026-03-22 09:00:00',
        'ends_at' => '2026-03-22 10:00:00',
        'timezone' => 'Europe/Amsterdam',
        'all_day' => false,
        'journal_date' => '2026-03-22',
    ]);

    $response = $this
        ->actingAs($user)
        ->getJson("/w/{$workspace->slug}/events?date=2026-03-22")
        ->assertOk();

    $events = collect((array) $response->json('events'));
    $event = $events->firstWhere('title', 'Calendar color event');

    expect($event)->toBeArray();
    expect(data_get($event, 'type'))->toBe('event');
    expect(data_get($event, 'calendar_color'))->toBe('#22c55e');
});

test('sidebar event indicators endpoint returns pending hydration data when projection rows are missing', function () {
    Queue::fake();

    $user = User::withoutEvents(fn () => User::factory()->create());
    $workspace = Workspace::query()->create([
        'owner_id' => $user->id,
        'is_personal' => true,
        'name' => 'Indicator Workspace',
    ]);
    $workspace->users()->attach($user->id, ['role' => 'owner']);
    $user->forceFill([
        'settings' => [
            ...(is_array($user->settings) ? $user->settings : []),
            'workspace_id' => $workspace->id,
        ],
    ])->save();

    $pastDailyNote = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-09-30',
        'title' => 'Wednesday',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $completedDailyNote = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-10-02',
        'title' => 'Friday',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $regularNote = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Task holder',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $pastDailyNote->id,
        'checked' => false,
        'task_status' => null,
        'content_text' => 'Open past task',
        'position' => 1,
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $completedDailyNote->id,
        'checked' => true,
        'task_status' => null,
        'content_text' => 'Done task',
        'position' => 1,
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $regularNote->id,
        'checked' => false,
        'task_status' => null,
        'due_date' => '2026-10-03',
        'content_text' => 'Open future task',
        'position' => 1,
    ]);

    $timeblock = Timeblock::query()->create([
        'location' => 'Meeting room',
    ]);

    Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $timeblock->id,
        'title' => 'Planned event',
        'starts_at' => '2026-10-01 09:00:00',
        'ends_at' => '2026-10-01 10:00:00',
        'timezone' => 'Europe/Amsterdam',
        'journal_date' => '2026-10-01',
    ]);

    Carbon::setTestNow(Carbon::parse('2026-10-02 10:00:00', 'Europe/Amsterdam'));

    try {
        $response = $this
            ->actingAs($user)
            ->getJson("/w/{$workspace->slug}/events/indicators?start=2026-09-28&end=2026-10-04")
            ->assertOk();

        $days = (array) $response->json('days');
        $pendingDates = (array) $response->json('pending_dates');

        expect(data_get($days, '2026-09-30.has_note'))->toBeFalse();
        expect(data_get($days, '2026-09-30.task_state'))->toBe('none');
        expect(data_get($days, '2026-10-01.has_events'))->toBeFalse();
        expect(data_get($days, '2026-10-02.task_state'))->toBe('none');
        expect(data_get($days, '2026-10-03.task_state'))->toBe('none');
        expect($pendingDates)->toContain('2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03');
        expect((int) $response->json('pending_count'))->toBe(count($pendingDates));

        Queue::assertPushed(\App\Jobs\RecalculateDailySignalsJob::class);
    } finally {
        Carbon::setTestNow();
    }
});

test('sidebar event indicators endpoint reads projected indicator rows', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    WorkspaceDailyIndicator::query()->create([
        'workspace_id' => $workspace->id,
        'date' => '2026-10-01',
        'structure_state' => 'note_exists',
        'calendar_state' => 'active',
        'work_state' => 'orange',
        'has_note' => true,
        'has_events' => true,
        'events_count' => 3,
        'birthday_count' => 1,
        'tasks_open_count' => 2,
        'tasks_completed_count' => 1,
    ]);

    WorkspaceDailyIndicator::query()->create([
        'workspace_id' => $workspace->id,
        'date' => '2026-10-02',
        'structure_state' => 'note_exists',
        'calendar_state' => null,
        'work_state' => 'green',
        'has_note' => true,
        'has_events' => false,
        'events_count' => 0,
        'birthday_count' => 0,
        'tasks_open_count' => 0,
        'tasks_completed_count' => 3,
    ]);

    $response = $this
        ->actingAs($user)
        ->getJson("/w/{$workspace->slug}/events/indicators?start=2026-10-01&end=2026-10-03")
        ->assertOk();

    $days = (array) $response->json('days');

    expect(data_get($days, '2026-10-01.has_note'))->toBeTrue();
    expect(data_get($days, '2026-10-01.has_events'))->toBeTrue();
    expect(data_get($days, '2026-10-01.task_state'))->toBe('open');
    expect((int) data_get($days, '2026-10-01.events_count'))->toBe(3);
    expect((int) data_get($days, '2026-10-01.birthday_count'))->toBe(1);
    expect((int) data_get($days, '2026-10-01.open_tasks_count'))->toBe(2);

    expect(data_get($days, '2026-10-02.has_note'))->toBeTrue();
    expect(data_get($days, '2026-10-02.has_events'))->toBeFalse();
    expect(data_get($days, '2026-10-02.task_state'))->toBe('all_completed');
    expect((int) data_get($days, '2026-10-02.events_count'))->toBe(0);
    expect((int) data_get($days, '2026-10-02.birthday_count'))->toBe(0);
    expect((int) data_get($days, '2026-10-02.open_tasks_count'))->toBe(0);

    expect(data_get($days, '2026-10-03.has_note'))->toBeFalse();
    expect(data_get($days, '2026-10-03.has_events'))->toBeFalse();
    expect(data_get($days, '2026-10-03.task_state'))->toBe('none');
});

test('sidebar event indicators marks legacy event rows as pending for backfill', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    WorkspaceDailyIndicator::query()->create([
        'workspace_id' => $workspace->id,
        'date' => '2026-03-17',
        'structure_state' => 'note_exists',
        'calendar_state' => 'active',
        'work_state' => null,
        'has_note' => true,
        'has_events' => true,
        'events_count' => 0,
        'birthday_count' => 0,
        'tasks_open_count' => 0,
        'tasks_completed_count' => 0,
    ]);

    $response = $this
        ->actingAs($user)
        ->getJson("/w/{$workspace->slug}/events/indicators?start=2026-03-17&end=2026-03-17")
        ->assertOk();

    expect((array) $response->json('pending_dates'))->toContain('2026-03-17');
    Queue::assertPushed(\App\Jobs\RecalculateDailySignalsJob::class);
});
