<?php

use App\Models\Note;
use App\Models\NoteRevision;
use App\Models\User;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

test('start creates a note for the authenticated user and redirects to it', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->get(route('notes.start'));

    $note = Note::query()->where('user_id', $user->id)->first();

    expect($note)->not()->toBeNull();
    expect($note->slug)->not()->toBeNull();
    $response->assertRedirect("/notes/{$note->slug}");
});

test('show resolves notes by slug', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'type' => 'note',
        'title' => 'My Project Note',
        'slug' => 'my-project-note',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/my-project-note')
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $note->id)
            ->where('noteUpdateUrl', '/notes/my-project-note'),
        );
});

test('journal route creates and reuses daily journal notes', function () {
    $user = User::factory()->create();

    $response = $this
        ->actingAs($user)
        ->get('/journal/daily/2026-03-07');

    $response->assertInertia(fn (Assert $page) => $page
        ->where('noteType', 'journal')
        ->where('journalGranularity', 'daily')
        ->where('journalPeriod', '2026-03-07'),
    );

    $journal = Note::query()
        ->where('user_id', $user->id)
        ->where('type', 'journal')
        ->where('journal_granularity', 'daily')
        ->whereDate('journal_date', '2026-03-07')
        ->first();

    expect($journal)->not()->toBeNull();

    $this->actingAs($user)->get('/journal/daily/2026-03-07')->assertOk();

    expect(
        Note::query()
            ->where('user_id', $user->id)
            ->where('type', 'journal')
            ->where('journal_granularity', 'daily')
            ->whereDate('journal_date', '2026-03-07')
            ->count(),
    )->toBe(1);
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
    expect($child->slug)->not()->toBeNull();
    $response->assertRedirect("/notes/{$child->slug}");
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

test('show returns breadcrumb path for the current note', function () {
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

    $this
        ->actingAs($user)
        ->get(route('notes.show', ['note' => $leaf->id], absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->has('breadcrumbs', 4)
            ->where('breadcrumbs.0.title', 'Notes')
            ->where('breadcrumbs.0.href', "/notes/{$root->id}")
            ->where('breadcrumbs.1.title', 'Acme')
            ->where('breadcrumbs.1.href', "/notes/{$root->id}")
            ->where('breadcrumbs.2.title', 'Project 1')
            ->where('breadcrumbs.2.href', "/notes/{$project->id}")
            ->where('breadcrumbs.3.title', 'Some note')
            ->where('breadcrumbs.3.href', '/notes/acme/project-1/some-note'),
        );
});

test('update preserves leading and trailing spaces in tiptap text nodes', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create();

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'before '],
                    [
                        'type' => 'mention',
                        'attrs' => [
                            'id' => 'Lea Thompson',
                            'label' => 'Lea Thompson',
                            'mentionSuggestionChar' => '@',
                        ],
                    ],
                    ['type' => 'text', 'text' => ' and '],
                    [
                        'type' => 'hashtag',
                        'attrs' => [
                            'id' => 'work',
                            'label' => 'work',
                            'mentionSuggestionChar' => '#',
                        ],
                    ],
                    ['type' => 'text', 'text' => ' after'],
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

    expect(data_get($note->content, 'content.0.content.0.text'))->toBe('before ');
    expect(data_get($note->content, 'content.0.content.2.text'))->toBe(' and ');
    expect(data_get($note->content, 'content.0.content.4.text'))->toBe(' after');
});

test('manual save always creates a note revision', function () {
    config()->set('note-revisions.autosave.default_interval_minutes', 15);

    $user = User::factory()->create();
    $note = $user->notes()->create();

    $payload = [
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
        'properties' => ['context' => 'manual'],
        'save_mode' => 'manual',
    ];

    $this->actingAs($user)->put(route('notes.update', ['note' => $note->id], absolute: false), $payload);
    $this->actingAs($user)->put(route('notes.update', ['note' => $note->id], absolute: false), $payload);

    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(2);
});

test('autosave revisions respect user configured interval', function () {
    config()->set('note-revisions.autosave.default_interval_minutes', 15);

    $user = User::factory()->create([
        'settings' => [
            'notes' => [
                'revision_autosave_interval_minutes' => 5,
            ],
        ],
    ]);
    $note = $user->notes()->create();

    $payload = [
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Autosave snapshot'],
                    ],
                ],
            ],
        ],
        'properties' => ['context' => 'auto'],
        'save_mode' => 'auto',
    ];

    $this->actingAs($user)->put(route('notes.update', ['note' => $note->id], absolute: false), $payload);
    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(1);

    $this->travel(4)->minutes();
    $this->actingAs($user)->put(route('notes.update', ['note' => $note->id], absolute: false), $payload);
    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(1);

    $this->travel(2)->minutes();
    $this->actingAs($user)->put(route('notes.update', ['note' => $note->id], absolute: false), $payload);
    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(2);
});

test('prune command applies retention windows to note revisions', function () {
    Carbon::setTestNow('2026-03-07 12:00:00');

    config()->set('note-revisions.retention.keep_all_for_hours', 1);
    config()->set('note-revisions.retention.keep_hourly_for_days', 1);
    config()->set('note-revisions.retention.keep_daily_for_days', 7);
    config()->set('note-revisions.retention.keep_weekly_for_weeks', 4);

    $user = User::factory()->create();
    $note = $user->notes()->create();

    $keepRecent = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'recent',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'recent'],
        'created_at' => now()->subMinutes(30),
        'updated_at' => now()->subMinutes(30),
    ]);

    $keepDaily = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'daily-keep',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'daily'],
        'created_at' => now()->subDays(2)->setTime(12, 0),
        'updated_at' => now()->subDays(2)->setTime(12, 0),
    ]);

    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'daily-drop',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'daily'],
        'created_at' => now()->subDays(2)->setTime(8, 0),
        'updated_at' => now()->subDays(2)->setTime(8, 0),
    ]);

    $weeklyKeepAt = now()->subWeeks(2)->startOfWeek()->addHours(10);
    $keepWeekly = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'weekly-keep',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'weekly'],
        'created_at' => $weeklyKeepAt,
        'updated_at' => $weeklyKeepAt,
    ]);

    $weeklyDropAt = now()->subWeeks(2)->startOfWeek()->addHours(2);
    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'weekly-drop',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'weekly'],
        'created_at' => $weeklyDropAt,
        'updated_at' => $weeklyDropAt,
    ]);

    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'very-old',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'old'],
        'created_at' => now()->subWeeks(10),
        'updated_at' => now()->subWeeks(10),
    ]);

    $this->artisan('notes:prune-revisions')->assertSuccessful();

    $remaining = NoteRevision::query()
        ->where('note_id', $note->id)
        ->pluck('id')
        ->all();

    expect($remaining)->toContain($keepRecent->id, $keepDaily->id, $keepWeekly->id);
    expect($remaining)->toHaveCount(3);

    Carbon::setTestNow();
});
