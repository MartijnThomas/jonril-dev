<?php

namespace App\Observers;

use App\Jobs\ReindexNoteJob;
use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteTask;
use App\Support\Notes\NoteMetaExtractor;
use App\Support\Notes\NoteTaskCountExtractor;
use App\Support\Notes\NoteWordCountExtractor;
use App\Support\Notes\TimeblockIndexer;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class NoteObserver
{
    public function __construct(
        private readonly NoteMetaExtractor $noteMetaExtractor,
        private readonly NoteTaskCountExtractor $noteTaskCountExtractor,
        private readonly NoteWordCountExtractor $noteWordCountExtractor,
        private readonly TimeblockIndexer $timeblockIndexer,
    ) {}

    public function saving(Note $note): void
    {
        $existing = is_array($note->meta) ? $note->meta : [];
        $extracted = $this->noteMetaExtractor->extract($note->content);
        $note->meta = array_merge($existing, $extracted, [
            'word_count' => $this->noteWordCountExtractor->count($note->content),
            'task_counts' => $this->noteTaskCountExtractor->count($note->content),
        ]);
    }

    public function saved(Note $note): void
    {
        $userId = Auth::id();

        ReindexNoteJob::dispatch($note->id, $userId);

        if ($note->wasChanged('title')) {
            $note->children()->each(function (Note $child) use ($userId): void {
                ReindexNoteJob::dispatch($child->id, $userId);
            });
        }

        if ($note->wasRecentlyCreated || $note->wasChanged('title') || $note->wasChanged('parent_id') || $note->wasChanged('type')) {
            $this->clearNoteSharedCache($note->workspace_id);
        }
    }

    public function deleted(Note $note): void
    {
        NoteTask::query()->where('note_id', $note->id)->delete();
        NoteHeading::query()->where('note_id', $note->id)->delete();
        $this->timeblockIndexer->deleteNoteTimeblocks($note);
        $this->clearNoteSharedCache($note->workspace_id);
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
        $userId = Auth::id();

        $note->children()
            ->withTrashed()
            ->whereNotNull('deleted_at')
            ->get()
            ->each(function (Note $child): void {
                $child->restore();
            });

        ReindexNoteJob::dispatch($note->id, $userId);
        $this->clearNoteSharedCache($note->workspace_id);
    }

    private function clearNoteSharedCache(string $workspaceId): void
    {
        Cache::forget("notes_dropdown_linkable_{$workspaceId}");
        Cache::forget("notes_dropdown_parents_{$workspaceId}");
        Cache::forget("notes_tree_{$workspaceId}");
        Cache::forget("notes_count_{$workspaceId}");
    }
}
