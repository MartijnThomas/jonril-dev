<?php

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a NoteTask in the source note that wiki-links to the target note,
 * so it shows up in the target note's related panel.
 */
function createRelatedTask(Note $sourceNote, Note $targetNote, string $blockId = 'rel-block-1'): NoteTask
{
    return NoteTask::create([
        'workspace_id' => $sourceNote->workspace_id,
        'note_id' => $sourceNote->id,
        'block_id' => $blockId,
        'position' => 1,
        'checked' => false,
        'task_status' => null,
        'content_text' => 'Related task linked to target',
        'render_fragments' => [
            ['type' => 'text', 'text' => 'Related task linked to '],
            ['type' => 'wikilink', 'note_id' => (string) $targetNote->id, 'text' => $targetNote->title ?? 'Target'],
        ],
    ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it('shows a context menu with all three options when right-clicking a related task', function () {
    $user = User::factory()->create(['password' => bcrypt('password'), 'settings' => ['language' => 'en']]);
    $workspace = $user->currentWorkspace();

    $targetNote = Note::factory()->for($workspace)->create(['title' => 'Target Note', 'type' => Note::TYPE_NOTE]);
    $sourceNote = Note::factory()->for($workspace)->create(['title' => 'Source Note', 'type' => Note::TYPE_NOTE]);

    createRelatedTask($sourceNote, $targetNote);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($targetNote))
        ->assertSee('Related task linked to')
        ->rightClick('[data-slot="context-menu-trigger"]')
        ->assertSee('Go to task in note')
        ->assertSee('Cancel task')
        ->assertSee('Migrate to this note')
        ->assertNoJavaScriptErrors();
});

it('cancels a related task from the context menu', function () {
    $user = User::factory()->create(['password' => bcrypt('password'), 'settings' => ['language' => 'en']]);
    $workspace = $user->currentWorkspace();

    $targetNote = Note::factory()->for($workspace)->create(['title' => 'Target Note', 'type' => Note::TYPE_NOTE]);
    $sourceNote = Note::factory()->for($workspace)->create([
        'title' => 'Source Note',
        'type' => Note::TYPE_NOTE,
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => ['id' => 'rel-block-cancel', 'checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Task to cancel']],
                    ]],
                ]],
            ]],
        ],
    ]);

    createRelatedTask($sourceNote, $targetNote, 'rel-block-cancel');

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($targetNote))
        ->assertSee('Related task linked to')
        ->rightClick('[data-slot="context-menu-trigger"]')
        ->assertSee('Cancel task')
        ->click('Cancel task')
        ->assertNoJavaScriptErrors();

    $sourceNote->refresh();
    $taskAttrs = $sourceNote->content['content'][0]['content'][0]['attrs'] ?? [];
    expect($taskAttrs['taskStatus'])->toBe('canceled');
});

it('migrates a related task to the current note from the context menu', function () {
    $user = User::factory()->create(['password' => bcrypt('password'), 'settings' => ['language' => 'en']]);
    $workspace = $user->currentWorkspace();

    $targetNote = Note::factory()->for($workspace)->create([
        'title' => 'Target Note',
        'type' => Note::TYPE_NOTE,
        'content' => ['type' => 'doc', 'content' => []],
    ]);
    $sourceNote = Note::factory()->for($workspace)->create([
        'title' => 'Source Note',
        'type' => Note::TYPE_NOTE,
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => ['id' => 'rel-block-migrate', 'checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Task to migrate']],
                    ]],
                ]],
            ]],
        ],
    ]);

    createRelatedTask($sourceNote, $targetNote, 'rel-block-migrate');

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($targetNote))
        ->assertSee('Related task linked to')
        ->rightClick('[data-slot="context-menu-trigger"]')
        ->assertSee('Migrate to this note')
        ->click('Migrate to this note')
        ->assertNoJavaScriptErrors();

    $sourceNote->refresh();
    $taskAttrs = $sourceNote->content['content'][0]['content'][0]['attrs'] ?? [];
    expect($taskAttrs['taskStatus'])->toBe('migrated');
    expect($taskAttrs['migratedToNoteId'])->toBe((string) $targetNote->id);
});
