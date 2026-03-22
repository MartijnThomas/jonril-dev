<?php

namespace App\Observers;

use App\Jobs\RecalculateDailySignalsJob;
use App\Jobs\ReindexNoteJob;
use App\Jobs\WarmNoteSharedCacheJob;
use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteTask;
use App\Support\Notes\BirthdayEventIndexer;
use App\Support\Notes\NoteMetaExtractor;
use App\Support\Notes\NoteTaskCountExtractor;
use App\Support\Notes\NoteWordCountExtractor;
use App\Support\Notes\TimeblockIndexer;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;

class NoteObserver
{
    private const NOTES_TREE_CACHE_VERSION = 'v2';

    public function __construct(
        private readonly NoteMetaExtractor $noteMetaExtractor,
        private readonly NoteTaskCountExtractor $noteTaskCountExtractor,
        private readonly NoteWordCountExtractor $noteWordCountExtractor,
        private readonly TimeblockIndexer $timeblockIndexer,
        private readonly BirthdayEventIndexer $birthdayEventIndexer,
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
        $originalJournalDate = $this->originalJournalDate($note);

        ReindexNoteJob::dispatch($note->id, $userId);

        if ($note->wasChanged('title') || $note->wasChanged('parent_id')) {
            $note->children()->each(function (Note $child) use ($userId): void {
                ReindexNoteJob::dispatch($child->id, $userId);
                $child->searchable();
            });
        }

        if ($note->wasRecentlyCreated || $note->wasChanged('title') || $note->wasChanged('parent_id') || $note->wasChanged('type')) {
            $this->clearNoteSharedCache($note->workspace_id);
        }

        $this->dispatchDailySignalRecalculation($note, $originalJournalDate);
    }

    public function deleted(Note $note): void
    {
        NoteTask::query()->where('note_id', $note->id)->delete();
        NoteHeading::query()->where('note_id', $note->id)->delete();
        $this->timeblockIndexer->deleteNoteTimeblocks($note);
        $this->clearNoteSharedCache($note->workspace_id);
        $this->dispatchDailySignalRecalculation($note, $this->originalJournalDate($note));
    }

    public function deleting(Note $note): void
    {
        $this->birthdayEventIndexer->deleteNoteBirthdayEvents($note);

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
        $this->dispatchDailySignalRecalculation($note, $this->originalJournalDate($note));
    }

    private function dispatchDailySignalRecalculation(Note $note, ?string $originalJournalDate = null): void
    {
        if ($note->type !== Note::TYPE_JOURNAL || $note->journal_granularity !== Note::JOURNAL_DAILY) {
            return;
        }

        $dates = [];
        if (is_string($originalJournalDate) && $originalJournalDate !== '') {
            $dates[] = $originalJournalDate;
        }
        if ($note->journal_date !== null) {
            $dates[] = $note->journal_date->toDateString();
        }

        $dates = array_values(array_unique($dates));
        if ($dates === []) {
            return;
        }

        RecalculateDailySignalsJob::dispatch($note->workspace_id, $dates);
    }

    private function originalJournalDate(Note $note): ?string
    {
        $previous = $note->getPrevious();
        $original = $previous['journal_date'] ?? $note->getOriginal('journal_date');
        if (! is_string($original) || trim($original) === '') {
            return null;
        }

        $timestamp = strtotime($original);

        return $timestamp === false ? null : date('Y-m-d', $timestamp);
    }

    private function clearNoteSharedCache(string $workspaceId): void
    {
        Cache::forget("notes_dropdown_linkable_{$workspaceId}");
        Cache::forget("notes_dropdown_parents_{$workspaceId}");
        Cache::forget("notes_tree_{$workspaceId}");
        Cache::forget(sprintf('notes_tree_%s_%s', self::NOTES_TREE_CACHE_VERSION, $workspaceId));
        Cache::forget("notes_count_{$workspaceId}");

        WarmNoteSharedCacheJob::dispatch($workspaceId);
    }
}
