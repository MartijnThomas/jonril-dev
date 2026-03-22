<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

it('renders history page without triggering editor render loops', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $note = Note::factory()->for($workspace)->create([
        'title' => 'History Editor Loop Note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Current content'],
                    ],
                ],
            ],
        ],
    ]);

    $revision = $note->revisions()->create([
        'user_id' => $user->id,
        'title' => 'History revision snapshot',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Revision content'],
                    ],
                ],
            ],
        ],
        'properties' => [],
    ]);

    $page = visit('/login')
        ->fill('email', $user->email)
        ->fill('password', 'password')
        ->press('Log in');

    $page->navigate("/notes/{$note->id}/history")
        ->assertPathIs("/notes/{$note->id}/history")
        ->assertSee('Current version')
        ->assertNoJavaScriptErrors();

    $page->navigate("/notes/{$note->id}/history/{$revision->id}")
        ->assertPathIs("/notes/{$note->id}/history/{$revision->id}")
        ->assertSee('Restore this version')
        ->assertNoJavaScriptErrors();
});
