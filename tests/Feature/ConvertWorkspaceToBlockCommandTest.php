<?php

use App\Models\Note;
use App\Models\Workspace;

test('workspace conversion dry run does not mutate notes or create a copied workspace', function () {
    $workspace = Workspace::factory()->create([
        'editor_mode' => Workspace::EDITOR_MODE_LEGACY,
    ]);

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Legacy test note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => '# Legacy test note'],
                    ],
                ],
            ],
        ],
    ]);

    $originalContent = $note->content;

    $this->artisan('notes:convert-workspace-to-block', [
        '--workspace' => $workspace->id,
        '--dry-run' => true,
    ])
        ->expectsOutputToContain('WORKSPACE BLOCK CONVERSION CONTEXT')
        ->expectsOutputToContain('Dry run complete')
        ->assertExitCode(0);

    $note->refresh();
    $workspace->refresh();

    expect($note->content)->toBe($originalContent);
    expect($workspace->editor_mode)->toBe(Workspace::EDITOR_MODE_LEGACY);
    expect($workspace->migrated_at)->toBeNull();
    expect(Workspace::query()->where('name', $workspace->name.' (Block)')->exists())->toBeFalse();
});

test('workspace conversion duplicates workspace, converts copy, and marks source as migrated', function () {
    $workspace = Workspace::factory()->create([
        'editor_mode' => Workspace::EDITOR_MODE_LEGACY,
        'name' => 'Legacy WS',
    ]);

    $parent = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Parent legacy',
        'slug' => 'parent-legacy',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => '# Parent converted'],
                    ],
                ],
            ],
        ],
    ]);

    $child = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'parent_id' => $parent->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Child legacy',
        'slug' => 'parent-legacy/child-legacy',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Child content'],
                    ],
                ],
            ],
        ],
    ]);

    $this->artisan('notes:convert-workspace-to-block', [
        '--workspace' => $workspace->id,
        '--force' => true,
    ])
        ->expectsOutputToContain('Workspace migration complete')
        ->assertExitCode(0);

    $workspace->refresh();
    $sourceNotes = Note::query()->where('workspace_id', $workspace->id)->orderBy('created_at')->get();
    $copiedWorkspace = Workspace::query()
        ->where('name', 'Legacy WS (Block)')
        ->where('owner_id', $workspace->owner_id)
        ->first();

    expect($workspace->migrated_at)->not()->toBeNull();
    expect($copiedWorkspace)->not()->toBeNull();
    expect($copiedWorkspace?->editor_mode)->toBe(Workspace::EDITOR_MODE_BLOCK);

    $copiedNotes = Note::query()
        ->where('workspace_id', $copiedWorkspace?->id)
        ->orderBy('created_at')
        ->get();

    expect($copiedNotes)->toHaveCount($sourceNotes->count());

    $copiedParent = $copiedNotes->firstWhere('slug', 'parent-legacy');
    $copiedChild = $copiedNotes->firstWhere('slug', 'parent-legacy/child-legacy');

    expect(data_get($copiedParent?->content, 'content.0.type'))->toBe('heading');
    expect((string) data_get($copiedParent?->content, 'content.0.content.0.text'))->toBe('Parent converted');
    expect($copiedChild?->parent_id)->toBe($copiedParent?->id);
    expect($sourceNotes->firstWhere('id', $parent->id)?->workspace_id)->toBe($workspace->id);
});

test('workspace conversion is skipped when source workspace is already marked as migrated', function () {
    $workspace = Workspace::factory()->create([
        'editor_mode' => Workspace::EDITOR_MODE_LEGACY,
        'migrated_at' => now(),
    ]);

    $this->artisan('notes:convert-workspace-to-block', [
        '--workspace' => $workspace->id,
        '--force' => true,
    ])
        ->expectsOutputToContain('already marked as migrated')
        ->assertExitCode(0);
});
