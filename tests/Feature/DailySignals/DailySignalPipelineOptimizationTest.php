<?php

use App\Models\Calendar;
use App\Models\User;
use App\Models\WorkspaceDailySignal;
use App\Support\DailySignals\Calculators\CalendarSyncHealthSignalCalculator;
use App\Support\DailySignals\Calculators\MeetingLoadSignalCalculator;
use App\Support\DailySignals\DailySignalPipeline;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

function isCalendarSelectQuery(array $entry): bool
{
    $sql = strtolower((string) ($entry['query'] ?? ''));

    return str_contains($sql, 'from "calendars"') || str_contains($sql, 'from `calendars`');
}

test('daily signal pipeline keeps one row per signal key on repeated recalculation', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $pipeline = app(DailySignalPipeline::class);
    $date = Carbon::create(2026, 3, 1, 0, 0, 0, 'UTC');

    $pipeline->recalculateDate($workspace, $date);
    $firstCount = WorkspaceDailySignal::query()
        ->where('workspace_id', $workspace->id)
        ->whereDate('date', $date->toDateString())
        ->count();

    $pipeline->recalculateDate($workspace, $date);
    $secondCount = WorkspaceDailySignal::query()
        ->where('workspace_id', $workspace->id)
        ->whereDate('date', $date->toDateString())
        ->count();

    expect($firstCount)->toBe(8)
        ->and($secondCount)->toBe(8);
});

test('meeting load calculator reuses active calendar ids per workspace within process', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Main',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/main/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $calculator = app(MeetingLoadSignalCalculator::class);
    DB::flushQueryLog();
    DB::enableQueryLog();

    $calculator->calculate($workspace, Carbon::create(2026, 3, 1, 0, 0, 0, 'UTC'));
    $calculator->calculate($workspace, Carbon::create(2026, 3, 2, 0, 0, 0, 'UTC'));

    DB::disableQueryLog();

    $calendarQueryCount = collect(DB::getQueryLog())
        ->filter(fn (array $entry): bool => isCalendarSelectQuery($entry))
        ->count();

    expect($calendarQueryCount)->toBe(1);
});

test('calendar sync health calculator reuses active calendars per workspace within process', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Main',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/main/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $calculator = app(CalendarSyncHealthSignalCalculator::class);
    DB::flushQueryLog();
    DB::enableQueryLog();

    $calculator->calculate($workspace, Carbon::create(2026, 3, 1, 0, 0, 0, 'UTC'));
    $calculator->calculate($workspace, Carbon::create(2026, 3, 2, 0, 0, 0, 'UTC'));

    DB::disableQueryLog();

    $calendarQueryCount = collect(DB::getQueryLog())
        ->filter(fn (array $entry): bool => isCalendarSelectQuery($entry))
        ->count();

    expect($calendarQueryCount)->toBe(1);
});
