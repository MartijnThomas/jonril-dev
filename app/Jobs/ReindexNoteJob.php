<?php

namespace App\Jobs;

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;
use App\Services\TimeblockCalendarSyncService;
use App\Support\Notes\BirthdayEventIndexer;
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
        BirthdayEventIndexer $birthdayEventIndexer,
        TimeblockCalendarSyncService $timeblockCalendarSyncService,
    ): void {
        $note = Note::withTrashed()->find($this->noteId);

        if (! $note) {
            return;
        }

        $user = $this->userId ? User::find($this->userId) : null;
        $defaultDurationMinutes = $user?->defaultTimeblockDurationMinutes() ?? 60;
        $userTimezone = $user?->timezonePreference();

        $previousDates = $this->collectTaskDatesForNote($note->id);

        // Remove stale search records before the DELETE + INSERT cycle
        NoteTask::query()->where('note_id', $note->id)->unsearchable();

        $taskIndexer->reindexNote($note);
        $headingIndexer->reindexNote($note);
        $birthdayEventIndexer->reindexNote($note);
        $timeblockDelta = $timeblockIndexer->reindexNote($note, $defaultDurationMinutes, $userTimezone);
        $timeblockCalendarSyncService->queueNoteTimeblockChanges($note, $user, $timeblockDelta);

        // Sync freshly inserted tasks to the search index
        NoteTask::query()->where('note_id', $note->id)->searchable();

        $newDates = $this->collectTaskDatesForNote($note->id);
        $affectedDates = collect([...$previousDates, ...$newDates])
            ->filter(fn ($date) => is_string($date) && $date !== '')
            ->unique()
            ->values()
            ->all();

        if ($affectedDates !== []) {
            RecalculateDailySignalsJob::dispatch($note->workspace_id, $affectedDates);
        }
    }

    /**
     * @return array<int, string>
     */
    private function collectTaskDatesForNote(string $noteId): array
    {
        $rows = NoteTask::query()
            ->where('note_id', $noteId)
            ->get(['journal_date', 'due_date', 'deadline_date']);

        return $rows->flatMap(function (NoteTask $task): array {
            return array_values(array_filter([
                $task->journal_date?->toDateString(),
                $task->due_date?->toDateString(),
                $task->deadline_date?->toDateString(),
            ]));
        })
            ->unique()
            ->values()
            ->all();
    }
}
