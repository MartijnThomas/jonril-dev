<?php

use App\Models\Note;
use App\Models\User;

test('command search returns note results and excludes journal by default', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project Atlas',
        'slug' => 'project-atlas',
        'properties' => [
            'icon' => 'rocket',
            'icon-color' => 'orange',
        ],
    ]);

    $journal = $user->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Daily Journal',
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->getJson('/search/command?mode=notes&q=project')
        ->assertOk()
        ->assertJsonPath('mode', 'notes')
        ->assertJsonPath('items.0.id', $note->id)
        ->assertJsonPath('items.0.icon', 'rocket')
        ->assertJsonPath('items.0.icon_color', 'orange')
        ->assertJsonPath('items.0.icon_bg', null)
        ->assertJsonPath('items.0.path', 'Project Atlas');

    $this
        ->actingAs($user)
        ->getJson('/search/command?mode=notes&q=journal')
        ->assertOk()
        ->assertJsonPath('mode', 'notes')
        ->assertJsonCount(0, 'items');

    $this
        ->actingAs($user)
        ->getJson('/search/command?mode=notes&q=journal&include_journal=1')
        ->assertOk()
        ->assertJsonPath('mode', 'notes')
        ->assertJsonPath('items.0.id', $journal->id)
        ->assertJsonPath('items.0.icon', 'calendar')
        ->assertJsonPath('items.0.icon_color', 'default');
});

test('command search returns heading results with anchor links', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

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
        ->getJson('/search/command?mode=headings&q=api');

    $response
        ->assertOk()
        ->assertJsonPath('mode', 'headings')
        ->assertJsonPath('items.0.note_id', $note->id)
        ->assertJsonPath('items.0.heading_id', 'heading-123')
        ->assertJsonPath('items.0.href', "/w/{$workspace?->slug}/notes/specs#heading-123")
        ->assertJsonPath('items.0.path', 'Specs');
});
