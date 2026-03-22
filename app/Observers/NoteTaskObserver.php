<?php

namespace App\Observers;

use App\Jobs\RecalculateDailySignalsJob;
use App\Models\Note;
use App\Models\NoteTask;
use Carbon\CarbonInterface;

class NoteTaskObserver
{
    public function created(NoteTask $noteTask): void
    {
        $this->dispatchForTask($noteTask, false);
    }

    public function updated(NoteTask $noteTask): void
    {
        if (
            ! $noteTask->wasChanged([
                'workspace_id',
                'note_id',
                'journal_date',
                'due_date',
                'deadline_date',
                'checked',
                'task_status',
                'migrated_to_note_id',
                'migrated_from_note_id',
            ])
        ) {
            return;
        }

        $this->dispatchForTask($noteTask, true);
    }

    public function deleted(NoteTask $noteTask): void
    {
        $this->dispatchForTask($noteTask, true);
    }

    public function restored(NoteTask $noteTask): void
    {
        $this->dispatchForTask($noteTask, false);
    }

    public function forceDeleted(NoteTask $noteTask): void
    {
        $this->dispatchForTask($noteTask, true);
    }

    private function dispatchForTask(NoteTask $task, bool $includeOriginal): void
    {
        if (! is_string($task->workspace_id) || trim($task->workspace_id) === '') {
            return;
        }

        $dates = collect([
            $this->normalizeDate($task->journal_date),
            $this->normalizeDate($task->due_date),
            $this->normalizeDate($task->deadline_date),
            $this->resolveDailyNoteDate($task->note_id, $task->workspace_id),
            $includeOriginal ? $this->normalizeDate($task->getOriginal('journal_date')) : null,
            $includeOriginal ? $this->normalizeDate($task->getOriginal('due_date')) : null,
            $includeOriginal ? $this->normalizeDate($task->getOriginal('deadline_date')) : null,
            $includeOriginal ? $this->resolveDailyNoteDate($task->getOriginal('note_id'), $task->workspace_id) : null,
        ])
            ->filter(fn ($date) => is_string($date) && $date !== '')
            ->unique()
            ->values()
            ->all();

        if ($dates === []) {
            return;
        }

        RecalculateDailySignalsJob::dispatch($task->workspace_id, $dates);
    }

    private function normalizeDate(mixed $value): ?string
    {
        if ($value instanceof CarbonInterface) {
            return $value->toDateString();
        }

        if (is_string($value) && preg_match('/^\d{4}-\d{2}-\d{2}/', $value) === 1) {
            return substr($value, 0, 10);
        }

        return null;
    }

    private function resolveDailyNoteDate(mixed $noteId, mixed $workspaceId): ?string
    {
        if (! is_string($noteId) || trim($noteId) === '') {
            return null;
        }

        if (! is_string($workspaceId) || trim($workspaceId) === '') {
            return null;
        }

        $note = Note::query()
            ->where('id', $noteId)
            ->where('workspace_id', $workspaceId)
            ->where('type', Note::TYPE_JOURNAL)
            ->where('journal_granularity', Note::JOURNAL_DAILY)
            ->first(['journal_date']);

        return $note?->journal_date?->toDateString();
    }
}
