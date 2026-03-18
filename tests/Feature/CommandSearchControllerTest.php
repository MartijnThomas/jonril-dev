<?php

use App\Models\Note;
use App\Models\User;

beforeEach(function (): void {
    config()->set('scout.driver', 'collection');
});

test('command search returns note results and excludes journal by default', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $slug = $workspace?->slug;

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project Atlas',
        'slug' => 'project-atlas',
        'properties' => [
            'icon' => 'rocket',
            'icon-color' => 'orange',
        ],
    ]);

    $parent = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Engineering',
    ]);

    $nested = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Fix auth flow',
        'parent_id' => $parent->id,
    ]);

    $journal = $user->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Daily Journal',
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
    ]);

    $slugOnly = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Unrelated title',
        'slug' => 'secret-slug-token',
    ]);

    $this
        ->actingAs($user)
        ->getJson("/w/{$slug}/search/command?mode=notes&q=project")
        ->assertOk()
        ->assertJsonPath('mode', 'notes')
        ->assertJsonPath('items.0.id', $note->id)
        ->assertJsonPath('items.0.icon', 'rocket')
        ->assertJsonPath('items.0.icon_color', 'orange')
        ->assertJsonPath('items.0.icon_bg', null)
        ->assertJsonPath('items.0.path', 'Project Atlas');

    $parentPathResponse = $this
        ->actingAs($user)
        ->getJson("/w/{$slug}/search/command?mode=notes&q=engineering")
        ->assertOk()
        ->assertJsonPath('mode', 'notes');

    expect(collect($parentPathResponse->json('items'))->pluck('id')->all())
        ->toContain($nested->id);

    $this
        ->actingAs($user)
        ->getJson("/w/{$slug}/search/command?mode=notes&q=journal")
        ->assertOk()
        ->assertJsonPath('mode', 'notes')
        ->assertJsonCount(0, 'items');

    $this
        ->actingAs($user)
        ->getJson("/w/{$slug}/search/command?mode=notes&q=journal&include_journal=1")
        ->assertOk()
        ->assertJsonPath('mode', 'notes')
        ->assertJsonPath('items.0.id', $journal->id)
        ->assertJsonPath('items.0.icon', 'calendar')
        ->assertJsonPath('items.0.icon_color', 'default');

    $slugOnlyResponse = $this
        ->actingAs($user)
        ->getJson("/w/{$slug}/search/command?mode=notes&q=secret-slug-token")
        ->assertOk()
        ->assertJsonPath('mode', 'notes');

    expect(collect($slugOnlyResponse->json('items'))->pluck('id')->all())
        ->not->toContain($slugOnly->id);
});

test('command search returns heading results with anchor links', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $slug = $workspace?->slug;

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Specs',
        'slug' => 'specs',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => [
                        'id' => 'heading-123',
                        'level' => 2,
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => 'API contract'],
                    ],
                ],
            ],
        ],
    ]);

    $response = $this
        ->actingAs($user)
        ->getJson("/w/{$slug}/search/command?mode=headings&q=api");

    $response
        ->assertOk()
        ->assertJsonPath('mode', 'headings')
        ->assertJsonPath('items.0.note_id', $note->id)
        ->assertJsonPath('items.0.heading_id', 'heading-123')
        ->assertJsonPath('items.0.href', "/w/{$workspace?->slug}/notes/{$note->id}#heading-123")
        ->assertJsonPath('items.0.path', 'Specs');
});

test('command search is scoped to the current workspace', function () {
    $user = User::factory()->create();
    $workspaceA = $user->currentWorkspace();

    $workspaceB = \App\Models\Workspace::factory()->create();
    $workspaceB->users()->attach($user->id, ['role' => 'member']);

    $noteInA = Note::factory()->create([
        'workspace_id' => $workspaceA->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Note in workspace A',
    ]);

    $noteInB = Note::factory()->create([
        'workspace_id' => $workspaceB->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Note in workspace B',
    ]);

    $responseA = $this
        ->actingAs($user)
        ->getJson("/w/{$workspaceA->slug}/search/command?mode=notes&q=workspace")
        ->assertOk();

    $idsA = collect($responseA->json('items'))->pluck('id');
    expect($idsA)->toContain($noteInA->id)
        ->not->toContain($noteInB->id);

    $responseB = $this
        ->actingAs($user)
        ->getJson("/w/{$workspaceB->slug}/search/command?mode=notes&q=workspace")
        ->assertOk();

    $idsB = collect($responseB->json('items'))->pluck('id');
    expect($idsB)->toContain($noteInB->id)
        ->not->toContain($noteInA->id);
});
