<?php

namespace App\Observers;

use App\Models\Note;
use App\Models\NoteTask;
use App\Support\Notes\NoteTaskIndexer;

class NoteObserver
{
    public function __construct(
        private readonly NoteTaskIndexer $noteTaskIndexer,
    ) {}

    public function saved(Note $note): void
    {
        $this->noteTaskIndexer->reindexNote($note);

        if ($note->wasChanged('title')) {
            $note->children()->each(function (Note $child): void {
                $this->noteTaskIndexer->reindexNote($child);
            });
        }
    }

    public function deleted(Note $note): void
    {
        NoteTask::query()->where('note_id', $note->id)->delete();
    }
}
