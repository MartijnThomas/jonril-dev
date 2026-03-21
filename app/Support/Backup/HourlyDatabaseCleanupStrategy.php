<?php

namespace App\Support\Backup;

use Illuminate\Support\Carbon;
use Spatie\Backup\BackupDestination\Backup;
use Spatie\Backup\BackupDestination\BackupCollection;
use Spatie\Backup\Tasks\Cleanup\CleanupStrategy;

class HourlyDatabaseCleanupStrategy extends CleanupStrategy
{
    public function deleteOldBackups(BackupCollection $backups): void
    {
        $keepHours = (int) config('backup_hourly_db.cleanup.keep_backups_for_hours', 36);
        $cutoff = Carbon::now()->subHours(max(1, $keepHours));

        $backups
            ->filter(fn (Backup $backup): bool => $backup->date()->lt($cutoff))
            ->each(fn (Backup $backup): bool => $backup->delete());
    }
}
