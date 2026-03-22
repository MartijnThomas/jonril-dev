<?php

use App\Jobs\RecalculateDailySignalsJob;
use App\Jobs\SyncCalendarJob;
use App\Models\Calendar;
use App\Models\User;
use App\Services\CalDavService;
use Illuminate\Support\Facades\Queue;

test('sync calendar job enqueues daily signal recalculation for sync window', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Work',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/work/',
        'username' => 'user@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $calDavService = Mockery::mock(CalDavService::class);
    $calDavService->shouldReceive('sync')
        ->once()
        ->withArgs(fn (Calendar $syncedCalendar): bool => $syncedCalendar->is($calendar));

    (new SyncCalendarJob($calendar))->handle($calDavService);

    Queue::assertPushed(RecalculateDailySignalsJob::class, function (RecalculateDailySignalsJob $job) use ($workspace): bool {
        return $job->workspaceId === $workspace->id
            && $job->dates !== []
            && in_array(now()->toDateString(), $job->dates, true);
    });
});

test('sync calendar job does nothing for inactive calendar', function () {
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
    $calDavService->shouldNotReceive('sync');

    (new SyncCalendarJob($calendar))->handle($calDavService);

    Queue::assertNotPushed(RecalculateDailySignalsJob::class);
});
