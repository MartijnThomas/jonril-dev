<?php

use App\Support\Backup\HourlyDatabaseCleanupStrategy;
use Spatie\Backup\Notifications\Notifications\BackupHasFailedNotification;
use Spatie\Backup\Notifications\Notifications\BackupWasSuccessfulNotification;

return [
    'backup' => [
        'name' => env('BACKUP_HOURLY_DB_NAME', env('APP_NAME', 'laravel-backup').'-db-hourly'),
        'destination' => [
            'disks' => ['backups'],
            'filename_prefix' => 'db-hourly-',
        ],
    ],

    'cleanup' => [
        'strategy' => HourlyDatabaseCleanupStrategy::class,
        'keep_backups_for_hours' => (int) env('BACKUP_HOURLY_DB_KEEP_HOURS', 36),
    ],

    'notifications' => [
        'notifications' => [
            BackupHasFailedNotification::class => ['slack'],
            BackupWasSuccessfulNotification::class => ['slack'],
        ],
    ],
];
