<?php

use App\Jobs\RecalculateDailySignalsJob;
use App\Jobs\SyncCalendarRangeJob;
use App\Models\Calendar;
use App\Models\User;
use App\Services\CalDavService;
use Illuminate\Support\Facades\Queue;

test('sync calendar range job enqueues daily signal recalculation for synced month', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Timeblocks',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/timeblocks/',
        'username' => 'user@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $calDavService = Mockery::mock(CalDavService::class);
    $calDavService->shouldReceive('syncPeriod')
        ->once()
        ->withArgs(fn (Calendar $syncedCalendar, string $period): bool => $syncedCalendar->is($calendar) && $period === '2026-06');

    (new SyncCalendarRangeJob($calendar, '2026-06'))->handle($calDavService);

    Queue::assertPushed(RecalculateDailySignalsJob::class, function (RecalculateDailySignalsJob $job) use ($workspace): bool {
        return $job->workspaceId === $workspace->id
            && count($job->dates) === 30
            && $job->dates[0] === '2026-06-01'
            && $job->dates[29] === '2026-06-30';
    });
});

test('sync calendar range job does nothing for inactive calendars', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Inactive',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/inactive/',
        'username' => 'user@example.test',
        'password' => 'secret',
        'is_active' => false,
    ]);

    $calDavService = Mockery::mock(CalDavService::class);
    $calDavService->shouldNotReceive('syncPeriod');

    (new SyncCalendarRangeJob($calendar, '2026-06'))->handle($calDavService);

    Queue::assertNotPushed(RecalculateDailySignalsJob::class);
});
