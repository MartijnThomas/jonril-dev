<?php

use App\Jobs\ReindexNoteJob;
use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;

test('note task searchable payload contains scout fields', function (): void {
    $task = new NoteTask([
        'note_title' => 'Daily',
        'parent_note_title' => 'Journal',
        'content_text' => 'Prepare sprint review',
        'hashtags' => ['planning'],
        'mentions' => ['lea'],
        'workspace_id' => 'workspace-1',
        'checked' => false,
        'task_status' => 'backlog',
        'due_date' => '2026-03-20',
        'deadline_date' => '2026-03-21',
        'journal_date' => '2026-03-19',
    ]);

    expect($task->toSearchableArray())->toBe([
        'note_title' => 'Daily',
        'parent_note_title' => 'Journal',
        'content_text' => 'Prepare sprint review',
        'hashtags' => ['planning'],
        'mentions' => ['lea'],
        'workspace_id' => 'workspace-1',
        'checked' => false,
        'task_status' => 'backlog',
        'due_date' => '2026-03-20',
        'deadline_date' => '2026-03-21',
        'journal_date' => '2026-03-19',
    ]);
});

test('reindex note job removes stale scout tasks and indexes fresh ones', function (): void {
    config()->set('scout.driver', 'collection');
    config()->set('scout.queue', false);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskItem',
                    'attrs' => [
                        'checked' => false,
                        'id' => 'fresh-task',
                    ],
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => 'Fresh scout task',
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $staleTask = NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'position' => 1,
        'checked' => false,
        'content_text' => 'Stale scout task',
    ]);

    $staleTask->searchable();

    expect(NoteTask::search('Stale scout task')->get()->pluck('id')->all())
        ->toContain($staleTask->id);

    ReindexNoteJob::dispatchSync($note->id, $user->id);

    expect(NoteTask::query()->whereKey($staleTask->id)->exists())->toBeFalse();
    expect(NoteTask::search('Stale scout task')->get()->pluck('id')->all())
        ->not->toContain($staleTask->id);
    expect(NoteTask::search('Fresh scout task')->get()->pluck('note_id')->all())
        ->toContain($note->id);
});
