<?php

namespace App\Observers;

use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteTask;
use App\Support\Notes\NoteHeadingIndexer;
use App\Support\Notes\NoteMetaExtractor;
use App\Support\Notes\NoteTaskIndexer;
use App\Support\Notes\TimeblockIndexer;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class NoteObserver
{
    public function __construct(
        private readonly NoteTaskIndexer $noteTaskIndexer,
        private readonly NoteHeadingIndexer $noteHeadingIndexer,
        private readonly TimeblockIndexer $timeblockIndexer,
        private readonly NoteMetaExtractor $noteMetaExtractor,
    ) {}

    public function saving(Note $note): void
    {
        $existing = is_array($note->meta) ? $note->meta : [];
        $extracted = $this->noteMetaExtractor->extract($note->content);
        $note->meta = array_merge($existing, $extracted);
    }

    public function saved(Note $note): void
    {
        $defaultDurationMinutes = Auth::user()?->defaultTimeblockDurationMinutes() ?? 60;
        $userTimezone = Auth::user()?->timezonePreference();

        $this->noteTaskIndexer->reindexNote($note);
        $this->timeblockIndexer->reindexNote($note, $defaultDurationMinutes, $userTimezone);
        $this->noteHeadingIndexer->reindexNote($note);

        if ($note->wasChanged('title')) {
            $note->children()->each(function (Note $child): void {
                $this->noteTaskIndexer->reindexNote($child);
            });
        }

        if ($note->wasRecentlyCreated || $note->wasChanged('title') || $note->wasChanged('parent_id') || $note->wasChanged('type')) {
            $this->clearNoteDropdownCache($note->workspace_id);
        }
    }

    public function deleted(Note $note): void
    {
        NoteTask::query()->where('note_id', $note->id)->delete();
        NoteHeading::query()->where('note_id', $note->id)->delete();
        $this->timeblockIndexer->deleteNoteTimeblocks($note);
        $this->clearNoteDropdownCache($note->workspace_id);
    }

    public function deleting(Note $note): void
    {
        if ($note->isForceDeleting()) {
            $note->children()
                ->withTrashed()
                ->get()
                ->each(function (Note $child): void {
                    $child->forceDelete();
                });

            return;
        }

        $note->children()->get()->each(function (Note $child): void {
            $child->delete();
        });
    }

    public function restored(Note $note): void
    {
        $note->children()
            ->withTrashed()
            ->whereNotNull('deleted_at')
            ->get()
            ->each(function (Note $child): void {
                $child->restore();
            });

        $defaultDurationMinutes = Auth::user()?->defaultTimeblockDurationMinutes() ?? 60;
        $userTimezone = Auth::user()?->timezonePreference();

        $this->noteTaskIndexer->reindexNote($note);
        $this->timeblockIndexer->reindexNote($note, $defaultDurationMinutes, $userTimezone);
        $this->noteHeadingIndexer->reindexNote($note);
        $this->clearNoteDropdownCache($note->workspace_id);
    }

    private function clearNoteDropdownCache(string $workspaceId): void
    {
        Cache::forget("notes_dropdown_linkable_{$workspaceId}");
        Cache::forget("notes_dropdown_parents_{$workspaceId}");
    }
}
