<?php

use Illuminate\Console\Scheduling\Schedule;

test('backup schedule includes daily full backup and hourly database backup with cleanup', function (): void {
    $events = collect(app(Schedule::class)->events());

    $dailyFullBackup = $events->first(
        fn ($event): bool => str_contains($event->getSummaryForDisplay(), 'backup:run')
            && ! str_contains($event->getSummaryForDisplay(), '--only-db')
    );

    $hourlyDatabaseBackup = $events->first(
        fn ($event): bool => str_contains($event->getSummaryForDisplay(), 'backup:run --only-db --config=backup_hourly_db')
    );

    $hourlyDatabaseCleanup = $events->first(
        fn ($event): bool => str_contains($event->getSummaryForDisplay(), 'backup:clean --config=backup_hourly_db')
    );

    expect($dailyFullBackup)->not->toBeNull();
    expect($dailyFullBackup?->getExpression())->toBe('0 6 * * *');

    expect($hourlyDatabaseBackup)->not->toBeNull();
    expect($hourlyDatabaseBackup?->getExpression())->toBe('15 * * * *');

    expect($hourlyDatabaseCleanup)->not->toBeNull();
    expect($hourlyDatabaseCleanup?->getExpression())->toBe('25 * * * *');
});

test('hourly database backup retention is configured for 36 hours', function (): void {
    expect(config('backup_hourly_db.cleanup.keep_backups_for_hours'))->toBe(36);
});
