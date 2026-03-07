<?php

use App\Models\Note;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('start creates a note for the authenticated user and redirects to it', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->get(route('notes.start'));

    $note = Note::query()->where('user_id', $user->id)->first();

    expect($note)->not()->toBeNull();
    $response->assertRedirect(route('notes.show', ['note' => $note->id], absolute: false));
});

test('update uses the first h1 as note title', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'title' => null,
        'content' => null,
        'properties' => null,
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Leading paragraph'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Expected Title'],
                ],
            ],
        ],
    ];

    $response = $this
        ->actingAs($user)
        ->from(route('notes.show', ['note' => $note->id], absolute: false))
        ->put(route('notes.update', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => ['context' => 'test'],
        ]);

    $response->assertRedirect(route('notes.show', ['note' => $note->id], absolute: false));

    $note->refresh();

    expect($note->title)->toBe('Expected Title');
    expect($note->properties)->toBe(['context' => 'test']);
    expect($note->content)->toBe($content);
});

test('update falls back to first text line when no h1 exists', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'title' => null,
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'First line'],
                    ['type' => 'hardBreak'],
                    ['type' => 'text', 'text' => 'Second line'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 2],
                'content' => [
                    ['type' => 'text', 'text' => 'Secondary heading'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put(route('notes.update', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => [],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->title)->toBe('First line');
});

test('property title overrides derived title through model accessor', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'title' => null,
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Derived Title'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put(route('notes.update', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => [
                'title' => 'Property Title',
                'context' => 'docs',
            ],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->getRawOriginal('title'))->toBe('Derived Title');
    expect($note->title)->toBe('Property Title');
});

test('start can create a child note when parent_id is provided', function () {
    $user = User::factory()->create();
    $parent = $user->notes()->create();

    $response = $this->actingAs($user)->get(route('notes.start', [
        'parent_id' => $parent->id,
    ], absolute: false));

    $child = Note::query()
        ->where('user_id', $user->id)
        ->where('parent_id', $parent->id)
        ->latest('created_at')
        ->first();

    expect($child)->not()->toBeNull();
    $response->assertRedirect(route('notes.show', ['note' => $child->id], absolute: false));
});

test('update can move a note under another note of the same user', function () {
    $user = User::factory()->create();
    $parent = $user->notes()->create();
    $note = $user->notes()->create();

    $this
        ->actingAs($user)
        ->put(route('notes.update', ['note' => $note->id], absolute: false), [
            'content' => [
                'type' => 'doc',
                'content' => [],
            ],
            'properties' => [],
            'parent_id' => $parent->id,
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->parent_id)->toBe($parent->id);
});

test('update rejects moving a note under its own descendant', function () {
    $user = User::factory()->create();
    $root = $user->notes()->create();
    $child = $user->notes()->create([
        'parent_id' => $root->id,
    ]);

    $response = $this
        ->actingAs($user)
        ->from(route('notes.show', ['note' => $root->id], absolute: false))
        ->put(route('notes.update', ['note' => $root->id], absolute: false), [
            'content' => [
                'type' => 'doc',
                'content' => [],
            ],
            'properties' => [],
            'parent_id' => $child->id,
        ]);

    $response
        ->assertRedirect(route('notes.show', ['note' => $root->id], absolute: false))
        ->assertSessionHasErrors('parent_id');

    $root->refresh();

    expect($root->parent_id)->toBeNull();
});

test('sidebar notes tree excludes journal notes and keeps hierarchy', function () {
    $user = User::factory()->create();

    $root = $user->notes()->create([
        'title' => 'Acme',
        'type' => 'note',
    ]);

    $project = $user->notes()->create([
        'title' => 'Project 1',
        'type' => 'note',
        'parent_id' => $root->id,
    ]);

    $leaf = $user->notes()->create([
        'title' => 'Some note',
        'type' => 'note',
        'parent_id' => $project->id,
    ]);

    $user->notes()->create([
        'title' => 'Daily journal',
        'type' => 'journal',
    ]);

    $response = $this
        ->actingAs($user)
        ->get(route('notes.show', ['note' => $leaf->id], absolute: false));

    $response->assertInertia(fn (Assert $page) => $page
        ->has('notesTree', 1)
        ->where('notesTree.0.id', $root->id)
        ->where('notesTree.0.title', 'Acme')
        ->has('notesTree.0.children', 1)
        ->where('notesTree.0.children.0.id', $project->id)
        ->where('notesTree.0.children.0.title', 'Project 1')
        ->has('notesTree.0.children.0.children', 1)
        ->where('notesTree.0.children.0.children.0.id', $leaf->id)
        ->where('notesTree.0.children.0.children.0.title', 'Some note'),
    );
});
