<?php

namespace App\Jobs;

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;
use App\Support\Notes\NoteHeadingIndexer;
use App\Support\Notes\NoteTaskIndexer;
use App\Support\Notes\TimeblockIndexer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ReindexNoteJob implements ShouldQueue
{
    use Queueable;

    public function __construct(
        public readonly string $noteId,
        public readonly ?string $userId = null,
    ) {
        $this->onQueue('indexing');
    }

    public function handle(
        NoteTaskIndexer $taskIndexer,
        NoteHeadingIndexer $headingIndexer,
        TimeblockIndexer $timeblockIndexer,
    ): void {
        $note = Note::withTrashed()->find($this->noteId);

        if (! $note) {
            return;
        }

        $user = $this->userId ? User::find($this->userId) : null;
        $defaultDurationMinutes = $user?->defaultTimeblockDurationMinutes() ?? 60;
        $userTimezone = $user?->timezonePreference();

        // Remove stale search records before the DELETE + INSERT cycle
        NoteTask::query()->where('note_id', $note->id)->unsearchable();

        $taskIndexer->reindexNote($note);
        $headingIndexer->reindexNote($note);
        $timeblockIndexer->reindexNote($note, $defaultDurationMinutes, $userTimezone);

        // Sync freshly inserted tasks to the search index
        NoteTask::query()->where('note_id', $note->id)->searchable();
    }
}
