<?php

namespace App\Jobs;

use App\Models\User;
use App\Support\Notes\NoteTaskIndexer;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class ReindexAllNoteTasksJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1200;

    public int $tries = 1;

    public function handle(NoteTaskIndexer $noteTaskIndexer): void
    {
        User::query()
            ->select('id')
            ->orderBy('id')
            ->chunk(100, function ($users) use ($noteTaskIndexer): void {
                foreach ($users as $user) {
                    $noteTaskIndexer->reindexUser($user);
                }
            });
    }
}
