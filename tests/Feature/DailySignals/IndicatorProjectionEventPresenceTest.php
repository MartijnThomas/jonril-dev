<?php

use App\Jobs\RecalculateDailySignalsJob;
use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\Event;
use App\Models\User;
use App\Models\WorkspaceDailyIndicator;

test('daily indicator marks has_events true for regular active calendar events', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Active Calendar',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/active/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $item = CalendarItem::query()->create([
        'calendar_id' => $calendar->id,
        'uid' => 'indicator-event-uid',
        'etag' => 'indicator-event-etag',
        'href' => '/calendar/indicator-event.ics',
    ]);

    Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => CalendarItem::class,
        'eventable_id' => $item->id,
        'title' => 'Indicator event',
        'starts_at' => '2026-06-18 09:00:00',
        'ends_at' => '2026-06-18 10:00:00',
        'timezone' => 'Europe/Amsterdam',
    ]);

    RecalculateDailySignalsJob::dispatchSync($workspace->id, ['2026-06-18']);

    $indicator = WorkspaceDailyIndicator::query()
        ->where('workspace_id', $workspace->id)
        ->whereDate('date', '2026-06-18')
        ->first();

    expect($indicator)->not->toBeNull();
    expect((bool) $indicator?->has_events)->toBeTrue();
    expect((int) $indicator?->events_count)->toBe(1);
});
