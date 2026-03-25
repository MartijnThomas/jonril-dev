<?php

namespace App\Jobs;

use App\Support\System\BackupProfilesCache;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

class RefreshBackupProfilesCacheJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 120;

    public function handle(): void
    {
        BackupProfilesCache::refresh();
    }

    public function failed(Throwable $exception): void
    {
        Log::error('Failed to refresh backup profiles cache.', [
            'error' => $exception->getMessage(),
        ]);
    }
}
