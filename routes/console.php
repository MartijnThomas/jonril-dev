<?php

use App\Support\System\ScheduledCommandHealthStore;
use Illuminate\Console\Scheduling\Event;
use Illuminate\Support\Facades\Schedule;
use Illuminate\Support\Stringable;

$track = static function (Event $event, string $key, string $label, string $command): Event {
    $context = [
        'label' => $label,
        'command' => $command,
        'expression' => $event->getExpression(),
        'timezone' => (string) ($event->timezone ?? config('app.timezone', 'UTC')),
    ];

    $event
        ->before(static function () use ($key, $context): void {
            ScheduledCommandHealthStore::markStarted($key, $context);
        })
        ->onSuccessWithOutput(static function (Stringable $output) use ($key, $context): void {
            ScheduledCommandHealthStore::markSuccess($key, [
                ...$context,
                'output' => (string) $output,
            ]);
        })
        ->onFailureWithOutput(static function (Stringable $output) use ($key, $context): void {
            ScheduledCommandHealthStore::markFailure($key, [
                ...$context,
                'output' => (string) $output,
            ]);
        });

    return $event;
};

$telescopePruneHours = app()->environment('local') ? 6 : 48;
$telescopePruneCommand = "telescope:prune --hours={$telescopePruneHours}";
$telescopePruneEvent = Schedule::command($telescopePruneCommand)->timezone('Europe/Amsterdam');

if (app()->environment('local')) {
    $telescopePruneEvent->everyThirtyMinutes();
} else {
    $telescopePruneEvent->daily();
}

$track(
    $telescopePruneEvent,
    'telescope_prune',
    'Telescope prune',
    $telescopePruneCommand,
);

$shouldScheduleBackups = ! app()->environment('local');

if ($shouldScheduleBackups) {
    $track(
        Schedule::command('backup:clean')->daily()->at('05:45')->timezone('Europe/Amsterdam'),
        'backup_clean_full',
        'Backup cleanup (full)',
        'backup:clean',
    );

    $track(
        Schedule::command('backup:run')->daily()->at('06:00')->timezone('Europe/Amsterdam'),
        'backup_run_full',
        'Backup run (full)',
        'backup:run',
    );

    $track(
        Schedule::command('backup:run --only-db --config=backup_hourly_db')->hourlyAt(15)->timezone('Europe/Amsterdam'),
        'backup_run_hourly_db',
        'Backup run (hourly database)',
        'backup:run --only-db --config=backup_hourly_db',
    );

    $track(
        Schedule::command('backup:clean --config=backup_hourly_db')->hourlyAt(25)->timezone('Europe/Amsterdam'),
        'backup_clean_hourly_db',
        'Backup cleanup (hourly database)',
        'backup:clean --config=backup_hourly_db',
    );
}

$track(
    Schedule::command('notes:prune-images')->daily()->at('04:45')->timezone('Europe/Amsterdam'),
    'note_images_prune',
    'Note image prune',
    'notes:prune-images',
);

$track(
    Schedule::command('timeblocks:sync-outbound --limit=100')->everyMinute()->timezone('Europe/Amsterdam'),
    'timeblocks_sync_outbound',
    'Timeblock outbound sync dispatch',
    'timeblocks:sync-outbound --limit=100',
);
