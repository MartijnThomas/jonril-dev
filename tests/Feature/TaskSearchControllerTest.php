<?php

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;
use App\Models\Workspace;

beforeEach(function (): void {
    config()->set('scout.driver', 'collection');
    config()->set('scout.queue', false);
});

test('task search excludes migrated workspace tasks', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $migratedWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
        'name' => 'Migrated Source',
        'migrated_at' => now(),
    ]);

    $personalNote = Note::factory()->create([
        'workspace_id' => $personalWorkspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Personal Task Note',
    ]);

    $migratedNote = Note::factory()->create([
        'workspace_id' => $migratedWorkspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Migrated Task Note',
    ]);

    $personalTask = NoteTask::query()->create([
        'workspace_id' => $personalWorkspace->id,
        'note_id' => $personalNote->id,
        'note_title' => $personalNote->display_title,
        'content_text' => 'Global needle task',
        'checked' => false,
    ]);
    $personalTask->searchable();

    $migratedTask = NoteTask::query()->create([
        'workspace_id' => $migratedWorkspace->id,
        'note_id' => $migratedNote->id,
        'note_title' => $migratedNote->display_title,
        'content_text' => 'Global needle task',
        'checked' => false,
    ]);
    $migratedTask->searchable();

    $response = $this
        ->actingAs($user)
        ->getJson('/tasks/search?q=needle')
        ->assertOk();

    $taskIds = $response->json('task_ids');
    expect($taskIds)->toContain($personalTask->id);
    expect($taskIds)->not->toContain($migratedTask->id);
});
