<?php

use App\Models\Note;
use App\Models\User;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * @return array<string, mixed>
 */
function taskNoteContent(string $blockId, bool $checked = false, ?string $taskStatus = null): array
{
    $attrs = ['id' => $blockId, 'checked' => $checked];
    if ($taskStatus !== null) {
        $attrs['taskStatus'] = $taskStatus;
    }

    return [
        'type' => 'doc',
        'content' => [[
            'type' => 'taskList',
            'content' => [[
                'type' => 'taskItem',
                'attrs' => $attrs,
                'content' => [[
                    'type' => 'paragraph',
                    'content' => [['type' => 'text', 'text' => 'Do something']],
                ]],
            ]],
        ]],
    ];
}

// ---------------------------------------------------------------------------
// Cancel by reference – success paths
// ---------------------------------------------------------------------------

test('can cancel a task by block_id', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $blockId = 'block-abc-123';

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent($blockId),
    ]);

    $this
        ->actingAs($user)
        ->patch(route('tasks.cancel-by-reference', absolute: false), [
            'note_id' => $note->id,
            'block_id' => $blockId,
        ])
        ->assertRedirect();

    $note->refresh();
    $taskAttrs = $note->content['content'][0]['content'][0]['attrs'];

    expect($taskAttrs['taskStatus'])->toBe('canceled');
    expect($taskAttrs['checked'])->toBeFalse();
    expect($taskAttrs['canceledAt'])->not->toBeNull();
});

test('can cancel a task by position when block_id is absent', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => ['checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Positional task']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch(route('tasks.cancel-by-reference', absolute: false), [
            'note_id' => $note->id,
            'position' => 1,
        ])
        ->assertRedirect();

    $note->refresh();
    $taskAttrs = $note->content['content'][0]['content'][0]['attrs'];

    expect($taskAttrs['taskStatus'])->toBe('canceled');
});

// ---------------------------------------------------------------------------
// Cancel by reference – authorisation & validation
// ---------------------------------------------------------------------------

test('unauthenticated user cannot cancel a task', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent('block-xyz'),
    ]);

    $this
        ->patch(route('tasks.cancel-by-reference', absolute: false), [
            'note_id' => $note->id,
            'block_id' => 'block-xyz',
        ])
        ->assertRedirect('/login');
});

test('non-member cannot cancel a task in another workspace', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $outsider = User::factory()->create();
    $blockId = 'block-secret';

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent($blockId),
    ]);

    $this
        ->actingAs($outsider)
        ->patch(route('tasks.cancel-by-reference', absolute: false), [
            'note_id' => $note->id,
            'block_id' => $blockId,
        ])
        ->assertSessionHasErrors('note_id');
});

test('cancel is rejected for migrated source workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill(['migrated_at' => now()])->save();
    $blockId = 'block-mig';

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent($blockId),
    ]);

    $this
        ->actingAs($user)
        ->patch(route('tasks.cancel-by-reference', absolute: false), [
            'note_id' => $note->id,
            'block_id' => $blockId,
        ])
        ->assertStatus(409);
});

test('cancel returns 422 when block_id does not match any task', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent('real-block'),
    ]);

    $this
        ->actingAs($user)
        ->patch(route('tasks.cancel-by-reference', absolute: false), [
            'note_id' => $note->id,
            'block_id' => 'nonexistent-block',
        ])
        ->assertStatus(422);
});

// ---------------------------------------------------------------------------
// Migrate to current note (uses existing tasks.migrate endpoint)
// ---------------------------------------------------------------------------

test('can migrate a related task to the current note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $blockId = 'block-migrate-me';

    $sourceNote = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent($blockId),
    ]);

    $targetNote = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $this
        ->actingAs($user)
        ->post(route('tasks.migrate', absolute: false), [
            'source_note_id' => $sourceNote->id,
            'block_id' => $blockId,
            'target_note_id' => $targetNote->id,
        ])
        ->assertRedirect();

    $sourceNote->refresh();
    $targetNote->refresh();

    $sourceTaskAttrs = $sourceNote->content['content'][0]['content'][0]['attrs'];
    expect($sourceTaskAttrs['taskStatus'])->toBe('migrated');
    expect($sourceTaskAttrs['migratedToNoteId'])->toBe((string) $targetNote->id);

    // Cloned task appears in the target note
    $targetNodes = $targetNote->content['content'];
    $lastNode = end($targetNodes);
    $migratedTaskAttrs = $lastNode['content'][0]['attrs'] ?? [];
    expect($migratedTaskAttrs['migratedFromNoteId'])->toBe((string) $sourceNote->id);
});

test('migrating a task to the same note as source is rejected', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $blockId = 'block-same';

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent($blockId),
    ]);

    $this
        ->actingAs($user)
        ->post(route('tasks.migrate', absolute: false), [
            'source_note_id' => $note->id,
            'block_id' => $blockId,
            'target_note_id' => $note->id,
        ])
        ->assertStatus(422);
});

test('non-member cannot migrate a task to a note in another workspace', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $outsider = User::factory()->create();
    $blockId = 'block-foreign';

    $sourceNote = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => taskNoteContent($blockId),
    ]);

    $targetNote = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $this
        ->actingAs($outsider)
        ->post(route('tasks.migrate', absolute: false), [
            'source_note_id' => $sourceNote->id,
            'block_id' => $blockId,
            'target_note_id' => $targetNote->id,
        ])
        ->assertSessionHasErrors(['source_note_id', 'target_note_id']);
});
