<?php

use App\Jobs\ReindexNoteJob;
use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteTask;
use App\Models\User;
use Illuminate\Support\Facades\Queue;

test('ReindexNoteJob indexes tasks and headings for a note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'content' => [
            'type' => 'doc',
            'content' => [
                ['type' => 'heading', 'attrs' => ['level' => 1, 'id' => 'heading-1'], 'content' => [['type' => 'text', 'text' => 'My Heading']]],
                ['type' => 'taskItem', 'attrs' => ['checked' => false, 'id' => 'task-1'], 'content' => [['type' => 'text', 'text' => 'Do something']]],
            ],
        ],
    ]);

    NoteTask::query()->where('note_id', $note->id)->delete();
    NoteHeading::query()->where('note_id', $note->id)->delete();

    ReindexNoteJob::dispatchSync($note->id, $user->id);

    expect(NoteTask::query()->where('note_id', $note->id)->count())->toBeGreaterThan(0);
    expect(NoteHeading::query()->where('note_id', $note->id)->count())->toBeGreaterThan(0);
});

test('ReindexNoteJob exits silently when note does not exist', function () {
    expect(fn () => ReindexNoteJob::dispatchSync('non-existent-id', null))->not->toThrow(Throwable::class);
});

test('saving a note dispatches ReindexNoteJob', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $this->actingAs($user);

    $note = Note::factory()->create(['workspace_id' => $workspace->id]);

    Queue::assertPushed(ReindexNoteJob::class, fn ($job) => $job->noteId === $note->id);
});

test('saving a note with a changed title also dispatches ReindexNoteJob for each child', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $this->actingAs($user);

    $parent = Note::factory()->create(['workspace_id' => $workspace->id, 'title' => 'Original']);
    $child = Note::factory()->create(['workspace_id' => $workspace->id, 'parent_id' => $parent->id]);

    Queue::fake(); // reset after creates dispatch jobs

    $parent->update(['title' => 'Renamed']);

    Queue::assertPushed(ReindexNoteJob::class, fn ($job) => $job->noteId === $parent->id);
    Queue::assertPushed(ReindexNoteJob::class, fn ($job) => $job->noteId === $child->id);
});

test('ReindexNoteJob is dispatched on the indexing queue', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $this->actingAs($user);

    Note::factory()->create(['workspace_id' => $workspace->id]);

    Queue::assertPushedOn('indexing', ReindexNoteJob::class);
});
