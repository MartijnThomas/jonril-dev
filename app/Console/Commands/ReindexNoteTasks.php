<?php

namespace App\Console\Commands;

use App\Jobs\ReindexAllNoteTasksJob;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Bus;

class ReindexNoteTasks extends Command
{
    protected $signature = 'notes:reindex-tasks {--queued : Dispatch as queued job instead of running synchronously}';

    protected $description = 'Reindex note tasks for all users';

    public function handle(): int
    {
        if ($this->option('queued')) {
            ReindexAllNoteTasksJob::dispatch();
            $this->info('Queued note task reindex job.');

            return self::SUCCESS;
        }

        Bus::dispatchSync(new ReindexAllNoteTasksJob);
        $this->info('Reindexed note tasks for all users.');

        return self::SUCCESS;
    }
}
