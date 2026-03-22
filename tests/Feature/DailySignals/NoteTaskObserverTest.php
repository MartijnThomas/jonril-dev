<?php

use App\Jobs\RecalculateDailySignalsJob;
use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;
use Illuminate\Support\Facades\Queue;

test('note task observer dispatches recalculation job for created task dates', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Signals source',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'content_text' => 'Task',
        'position' => 1,
        'due_date' => '2026-03-24',
        'deadline_date' => '2026-03-25',
        'journal_date' => '2026-03-23',
        'checked' => false,
    ]);

    Queue::assertPushed(RecalculateDailySignalsJob::class, function (RecalculateDailySignalsJob $job) use ($workspace): bool {
        $dates = collect($job->dates)->sort()->values()->all();

        return $job->workspaceId === $workspace->id
            && $dates === ['2026-03-23', '2026-03-24', '2026-03-25'];
    });
});

test('note task observer includes original and new dates when task date changes', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Signals source',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $task = NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'content_text' => 'Task',
        'position' => 1,
        'due_date' => '2026-03-24',
        'checked' => false,
    ]);

    Queue::fake();

    $task->update([
        'due_date' => '2026-03-29',
    ]);

    Queue::assertPushed(RecalculateDailySignalsJob::class, function (RecalculateDailySignalsJob $job) use ($workspace): bool {
        $dates = collect($job->dates)->sort()->values()->all();

        return $job->workspaceId === $workspace->id
            && $dates === ['2026-03-24', '2026-03-29'];
    });
});

test('note task observer dispatches recalculation for daily note date even without explicit task dates', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $dailyNote = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-28',
        'title' => 'Daily',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $dailyNote->id,
        'content_text' => 'Task',
        'position' => 1,
        'checked' => false,
    ]);

    Queue::assertPushed(RecalculateDailySignalsJob::class, function (RecalculateDailySignalsJob $job) use ($workspace): bool {
        return $job->workspaceId === $workspace->id
            && $job->dates === ['2026-03-28'];
    });
});
