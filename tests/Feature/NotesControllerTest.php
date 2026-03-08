<?php

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\NoteRevision;
use App\Models\User;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

test('start creates a note for the authenticated user and redirects to it', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $this->actingAs($user);

    $response = $this->get(route('notes.start'));

    $note = Note::query()->where('workspace_id', $workspace?->id)->first();

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
            ->where('noteUpdateUrl', '/notes/'.$note->id),
        );
});

test('rename updates db title and rebuilds parent and child slugs', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project',
        'slug' => 'project',
        'properties' => [
            'title' => 'Display title should not change slug',
        ],
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child note',
        'slug' => 'project/child-note',
        'parent_id' => $parent->id,
    ]);

    $response = $this
        ->actingAs($user)
        ->patch("/notes/{$parent->id}/rename", [
            'title' => 'Project X',
        ]);

    $response->assertRedirect('/notes/project-x');

    $parent->refresh();
    $child->refresh();

    expect($parent->getRawOriginal('title'))->toBe('Project X');
    expect($parent->slug)->toBe('project-x');
    expect($child->slug)->toBe('project-x/child-note');
    expect(data_get($parent->properties, 'title'))->toBe('Display title should not change slug');
});

test('rename also updates first heading level one when present', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Original',
        'slug' => 'original',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [
                        ['type' => 'text', 'text' => 'Original'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Body'],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/rename", [
            'title' => 'Renamed',
        ])
        ->assertRedirect('/notes/renamed');

    $note->refresh();
    expect(data_get($note->content, 'content.0.content.0.text'))->toBe('Renamed');
});

test('rename does not modify content when no heading level one exists', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $originalContent = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'No heading'],
                ],
            ],
        ],
    ];

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Original',
        'slug' => 'original-2',
        'content' => $originalContent,
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/rename", [
            'title' => 'Renamed no h1',
        ])
        ->assertRedirect('/notes/renamed-no-h1');

    $note->refresh();
    expect($note->content)->toBe($originalContent);
});

test('destroy soft deletes note and redirects to notes list', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Delete me',
        'slug' => 'delete-me',
    ]);

    $this
        ->actingAs($user)
        ->delete("/notes/{$note->id}")
        ->assertRedirect('/notes/list');

    $this->assertSoftDeleted('notes', [
        'id' => $note->id,
    ]);
});

test('clear removes content and properties for regular note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Clear me',
        'slug' => 'clear-me',
        'content' => [
            'type' => 'doc',
            'content' => [
                ['type' => 'heading', 'attrs' => ['level' => 1], 'content' => [['type' => 'text', 'text' => 'Clear me']]],
                ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Some body']]],
            ],
        ],
        'properties' => [
            'context' => 'acme',
            'tags' => ['one', 'two'],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/clear")
        ->assertStatus(302);

    $note->refresh();

    expect($note->content)->toBe([
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Clear me'],
                ],
            ],
        ],
    ]);
    expect($note->properties)->toBe([]);
    expect($note->getRawOriginal('title'))->toBe('Clear me');
});

test('clear removes content and properties for journal note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-08',
        'title' => 'Custom journal title',
        'slug' => 'journal/daily/2026-03-08',
        'content' => [
            'type' => 'doc',
            'content' => [
                ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Daily text']]],
            ],
        ],
        'properties' => [
            'tags' => ['daily'],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/clear")
        ->assertStatus(302);

    $note->refresh();

    expect($note->content)->toBe([
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Custom journal title'],
                ],
            ],
        ],
    ]);
    expect($note->properties)->toBe([]);
    expect($note->getRawOriginal('title'))->toBe('Custom journal title');
});

test('soft deleted notes are not resolved by slug and can be restored', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Soft delete test',
        'slug' => 'soft-delete-test',
    ]);

    $note->delete();

    $this->assertSoftDeleted('notes', [
        'id' => $note->id,
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/soft-delete-test')
        ->assertNotFound();

    $note->restore();

    $this
        ->actingAs($user)
        ->get('/notes/soft-delete-test')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $note->id),
        );
});

test('deleting a note soft deletes all descendants recursively', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root',
        'slug' => 'root',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'slug' => 'child',
        'parent_id' => $root->id,
    ]);
    $grandchild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Grandchild',
        'slug' => 'grandchild',
        'parent_id' => $child->id,
    ]);

    $this
        ->actingAs($user)
        ->delete("/notes/{$root->id}")
        ->assertRedirect(route('notes.index'));

    $this->assertSoftDeleted('notes', ['id' => $root->id]);
    $this->assertSoftDeleted('notes', ['id' => $child->id]);
    $this->assertSoftDeleted('notes', ['id' => $grandchild->id]);
});

test('restoring a soft deleted note restores descendants recursively', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root',
        'slug' => 'root',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'slug' => 'child',
        'parent_id' => $root->id,
    ]);
    $grandchild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Grandchild',
        'slug' => 'grandchild',
        'parent_id' => $child->id,
    ]);

    $root->delete();

    $root->restore();

    $this->assertDatabaseHas('notes', [
        'id' => $root->id,
        'deleted_at' => null,
    ]);
    $this->assertDatabaseHas('notes', [
        'id' => $child->id,
        'deleted_at' => null,
    ]);
    $this->assertDatabaseHas('notes', [
        'id' => $grandchild->id,
        'deleted_at' => null,
    ]);
});

test('notes list page shows only root notes initially for normal notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'parent_id' => $root->id,
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Daily note',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/list')
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/index')
            ->has('roots', 1)
            ->where('roots.0.id', $root->id)
            ->where('roots.0.has_children', true)
            ->where('filters.type', Note::TYPE_NOTE),
        );
});

test('notes tree endpoint lazily returns children for parent', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'parent_id' => $root->id,
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/tree?parent_id='.$root->id);

    $response
        ->assertOk()
        ->assertJsonCount(1, 'nodes')
        ->assertJsonPath('nodes.0.id', $child->id)
        ->assertJsonPath('nodes.0.title', 'Project 1')
        ->assertJsonPath('nodes.0.tasks_total', 0)
        ->assertJsonPath('nodes.0.tasks_open', 0);
});

test('notes tree endpoint returns task totals and open counts per note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => 'b1',
        'position' => 1,
        'checked' => false,
        'content_text' => 'Open task',
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => 'b2',
        'position' => 2,
        'checked' => true,
        'content_text' => 'Closed task',
    ]);
    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'Acme',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => [],
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.tasks_total', 2)
        ->assertJsonPath('nodes.0.tasks_open', 1)
        ->assertJsonPath('nodes.0.revision_count', 1);

    $createdAt = data_get($response->json(), 'nodes.0.created_at');
    $updatedAt = data_get($response->json(), 'nodes.0.updated_at');

    expect($createdAt)->toBeString();
    expect($updatedAt)->toBeString();
});

test('notes tree endpoint uses model accessor values for icon metadata and taxonomy', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
        'properties' => [
            'icon' => 'alarm-clock',
            'icon-color' => 'blue',
            'icon-bg' => 'stone',
            'context' => 'client-a',
            'tags' => ['#ops', ' platform '],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.icon', 'alarm-clock')
        ->assertJsonPath('nodes.0.icon_color', 'blue')
        ->assertJsonPath('nodes.0.icon_bg', 'stone')
        ->assertJsonPath('nodes.0.context', 'client-a')
        ->assertJsonPath('nodes.0.tags.0', 'ops')
        ->assertJsonPath('nodes.0.tags.1', 'platform')
        ->assertJsonPath('nodes.0.path', 'Acme');
});

test('notes tree endpoint returns dash-ready null word count until first save', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
        'word_count' => null,
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.word_count', null);
});

test('note save updates persisted word count used by notes overview', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'one two three four'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $content,
            'properties' => [],
        ])
        ->assertStatus(302);

    $note->refresh();
    expect($note->word_count)->toBe(4);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.word_count', 4);
});

test('notes tree exposes journal years at top level', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'slug' => 'journal/daily/2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', 'journal:year:2026')
        ->assertJsonPath('nodes.0.is_virtual', true)
        ->assertJsonPath('nodes.0.has_children', true)
        ->assertJsonPath('nodes.0.type', Note::TYPE_JOURNAL);
});

test('notes tree exposes journal week and daily children', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_WEEKLY,
        'journal_date' => '2026-03-02',
        'title' => 'Week 10 2026',
        'slug' => 'journal/weekly/2026-W10',
    ]);

    $daily = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'slug' => 'journal/daily/2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all&parent_id=journal:month:2026-03')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', 'journal:week:2026-W10')
        ->assertJsonPath('nodes.0.has_children', true);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all&parent_id=journal:week:2026-W10')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $daily->id)
        ->assertJsonPath('nodes.0.is_virtual', false)
        ->assertJsonPath('nodes.0.has_children', false);
});

test('journal virtual period node shows metrics when backing note exists', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $monthly = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_MONTHLY,
        'journal_date' => '2026-03-01',
        'title' => 'Maart 2026',
        'slug' => 'journal/monthly/2026-03',
        'word_count' => 123,
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $monthly->id,
        'block_id' => 'b1',
        'position' => 1,
        'checked' => false,
        'content_text' => 'Open task',
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/tree?type=all&parent_id=journal:year:2026')
        ->assertOk();

    $response
        ->assertJsonPath('nodes.0.id', 'journal:month:2026-03')
        ->assertJsonPath('nodes.0.is_virtual', true)
        ->assertJsonPath('nodes.0.has_note', true)
        ->assertJsonPath('nodes.0.href', '/journal/monthly/2026-03')
        ->assertJsonPath('nodes.0.tasks_total', 1)
        ->assertJsonPath('nodes.0.tasks_open', 1)
        ->assertJsonPath('nodes.0.word_count', 123);
});

test('journal virtual period node without backing note stays linkable for creation', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'slug' => 'journal/daily/2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', 'journal:year:2026')
        ->assertJsonPath('nodes.0.is_virtual', true)
        ->assertJsonPath('nodes.0.has_note', false)
        ->assertJsonPath('nodes.0.href', '/journal/yearly/2026');
});

test('notes list filters context and keeps ancestors visible', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'parent_id' => $root->id,
        'properties' => [
            'context' => 'client-a',
        ],
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/list?context=client-a');

    $response->assertInertia(fn (Assert $page) => $page
        ->has('roots', 1)
        ->where('roots.0.id', $root->id)
        ->where('roots.0.has_children', true),
    );
});

test('notes tree token filter matches context or tags', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $contextChild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Context child',
        'parent_id' => $root->id,
        'properties' => ['context' => 'client-a'],
    ]);

    $tagChild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Tag child',
        'parent_id' => $root->id,
        'properties' => ['tags' => ['ops']],
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=note&parent_id='.$root->id.'&tokens=@client-a,%23ops')
        ->assertOk()
        ->assertJsonCount(2, 'nodes')
        ->assertJsonPath('nodes.0.id', $contextChild->id)
        ->assertJsonPath('nodes.1.id', $tagChild->id);
});

test('update endpoint remains stable when note slug changes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Original title',
        'slug' => 'original-title',
    ]);

    $baseContent = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Heading title'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $baseContent,
            'properties' => [
                'title' => 'Changed title',
                'context' => 'team',
            ],
        ])
        ->assertStatus(302);

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $baseContent,
            'properties' => [
                'title' => 'Original title',
                'context' => 'team',
            ],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect(Note::query()->where('workspace_id', $workspace?->id)->count())->toBe(1);
    expect($note->title)->toBe('Original title');
});

test('property title override does not influence slug generation', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Base Title',
        'slug' => 'base-title',
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Base Title'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $content,
            'properties' => [
                'title' => 'Display Title Only',
            ],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->getRawOriginal('title'))->toBe('Base Title');
    expect($note->title)->toBe('Display Title Only');
    expect($note->slug)->toBe('base-title');
});

test('journal route creates and reuses daily journal notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $response = $this
        ->actingAs($user)
        ->get('/journal/daily/2026-03-07');

    $response->assertInertia(fn (Assert $page) => $page
        ->where('noteType', 'journal')
        ->where('journalGranularity', 'daily')
        ->where('journalPeriod', '2026-03-07'),
    );

    $journal = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->where('type', 'journal')
        ->where('journal_granularity', 'daily')
        ->whereDate('journal_date', '2026-03-07')
        ->first();

    expect($journal)->not()->toBeNull();

    $this->actingAs($user)->get('/journal/daily/2026-03-07')->assertOk();

    expect(
        Note::query()
            ->where('workspace_id', $workspace?->id)
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
    $workspace = $user->currentWorkspace();
    $parent = $user->notes()->create();

    $response = $this->actingAs($user)->get(route('notes.start', [
        'parent_id' => $parent->id,
    ], absolute: false));

    $child = Note::query()
        ->where('workspace_id', $workspace?->id)
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
        'properties' => [
            'icon' => 'alarm-clock',
            'icon-color' => 'blue',
            'icon-bg' => 'stone',
        ],
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
        ->where('notesTree.0.icon', 'alarm-clock')
        ->where('notesTree.0.icon_color', 'blue')
        ->where('notesTree.0.icon_bg', 'stone')
        ->has('notesTree.0.children', 1)
        ->where('notesTree.0.children.0.id', $project->id)
        ->where('notesTree.0.children.0.title', 'Project 1')
        ->has('notesTree.0.children.0.children', 1)
        ->where('notesTree.0.children.0.children.0.id', $leaf->id)
        ->where('notesTree.0.children.0.children.0.title', 'Some note'),
    );
});

test('notes trees show Untitled when note title is empty', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'title' => '   ',
        'type' => Note::TYPE_NOTE,
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.title', 'Untitled');

    $this
        ->actingAs($user)
        ->get(route('notes.show', ['note' => $note->id], absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->where('notesTree.0.id', $note->id)
            ->where('notesTree.0.title', 'Untitled'),
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

test('daily journal note shows year month week and day breadcrumbs', function () {
    $user = User::factory()->create();

    $this
        ->actingAs($user)
        ->get('/journal/daily/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->has('breadcrumbs', 5)
            ->where('breadcrumbs.0.title', 'Journal')
            ->where('breadcrumbs.0.href', '/journal/daily/2026-03-07')
            ->where('breadcrumbs.1.title', '2026')
            ->where('breadcrumbs.1.href', '/journal/yearly/2026')
            ->where('breadcrumbs.2.title', 'Maart')
            ->where('breadcrumbs.2.href', '/journal/monthly/2026-03')
            ->where('breadcrumbs.3.title', 'Week 10')
            ->where('breadcrumbs.3.href', '/journal/weekly/2026-W10')
            ->where('breadcrumbs.4.title', 'Zaterdag 7 maart 2026')
            ->where('breadcrumbs.4.href', '/journal/daily/2026-03-07'),
        );
});

test('daily journal note uses english title and breadcrumbs when user language is english', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);

    $this
        ->actingAs($user)
        ->get('/journal/daily/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('breadcrumbs.2.title', 'March')
            ->where('breadcrumbs.4.title', 'Saturday 7 March 2026')
            ->where('content.content.0.content.0.text', 'Saturday 7 March 2026'),
        );
});

test('daily journal note includes due and deadline tasks for that day excluding current note tasks', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $currentDaily = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'daily-self-task',
                        'checked' => false,
                        'dueDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Should be excluded']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $dueNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Due note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'due-task-1',
                        'checked' => false,
                        'dueDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Due today']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $deadlineNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Deadline note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'deadline-task-1',
                        'checked' => false,
                        'deadlineDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Deadline today']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Outside note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'outside-task-1',
                        'checked' => false,
                        'dueDate' => '2026-03-08',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Outside day']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $wikiOnlyNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Wiki only note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'wiki-only-task',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [
                            ['type' => 'text', 'text' => 'Linked to day '],
                            [
                                'type' => 'text',
                                'text' => 'Daily note',
                                'marks' => [[
                                    'type' => 'wikiLink',
                                    'attrs' => [
                                        'noteId' => $currentDaily->id,
                                        'href' => "/notes/{$currentDaily->id}",
                                    ],
                                ]],
                            ],
                        ],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/journal/daily/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $currentDaily->id)
            ->has('relatedTasks', 3)
            ->where('relatedTasks.0.note_id', $dueNote->id)
            ->where('relatedTasks.0.content', 'Due today')
            ->where('relatedTasks.0.due_date', '2026-03-07')
            ->where('relatedTasks.1.note_id', $deadlineNote->id)
            ->where('relatedTasks.1.content', 'Deadline today')
            ->where('relatedTasks.1.deadline_date', '2026-03-07')
            ->where('relatedTasks.2.note_id', $wikiOnlyNote->id),
        );
});

test('toggling a daily task updates persisted checked state reflected on daily note panel reload', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $taskNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Task source note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'daily-toggle-task',
                        'checked' => false,
                        'dueDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Toggle from daily panel']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $task = NoteTask::query()
        ->where('note_id', $taskNote->id)
        ->where('block_id', 'daily-toggle-task')
        ->firstOrFail();

    $this
        ->actingAs($user)
        ->patch('/tasks/checked', [
            'note_id' => $task->note_id,
            'block_id' => $task->block_id,
            'position' => $task->position,
            'checked' => true,
        ])
        ->assertRedirect();

    $this
        ->actingAs($user)
        ->get('/journal/daily/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->has('relatedTasks', 1)
            ->where('relatedTasks.0.note_id', $taskNote->id)
            ->where('relatedTasks.0.checked', true),
        );
});

test('regular note includes related tasks that link to it', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target note',
    ]);

    $sourceWithLink = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source with link',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'related-task-1',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'attrs' => ['id' => 'related-task-1-p'],
                        'content' => [
                            ['type' => 'text', 'text' => 'Task about '],
                            [
                                'type' => 'text',
                                'text' => 'Target note',
                                'marks' => [[
                                    'type' => 'wikiLink',
                                    'attrs' => [
                                        'noteId' => $target->id,
                                        'href' => "/notes/{$target->id}",
                                    ],
                                ]],
                            ],
                        ],
                    ]],
                ]],
            ]],
        ],
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source without link',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'related-task-2',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'attrs' => ['id' => 'related-task-2-p'],
                        'content' => [
                            ['type' => 'text', 'text' => 'Not related'],
                        ],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get("/notes/{$target->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->has('relatedTasks', 1)
            ->where('relatedTasks.0.note_id', $sourceWithLink->id)
            ->where('relatedTasks.0.block_id', 'related-task-1')
            ->where('relatedTasks.0.checked', false),
        );
});

test('regular note includes backlinks with snippet', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target note',
    ]);

    $source = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['id' => 'h-source', 'level' => 2],
                    'content' => [
                        ['type' => 'text', 'text' => 'Planning'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => ['id' => 'p-source'],
                    'content' => [
                        ['type' => 'text', 'text' => 'See '],
                        [
                            'type' => 'text',
                            'text' => 'Target note',
                            'marks' => [[
                                'type' => 'wikiLink',
                                'attrs' => [
                                    'noteId' => $target->id,
                                    'href' => "/notes/{$target->id}",
                                ],
                            ]],
                        ],
                        ['type' => 'text', 'text' => ' for details'],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get("/notes/{$target->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->has('backlinks', 1)
            ->where('backlinks.0.block_id', 'p-source')
            ->where('backlinks.0.render_fragments.1.type', 'wikilink')
            ->where('backlinks.0.render_fragments.1.text', 'Target note')
            ->where('backlinks.0.note.id', $source->id)
            ->where('backlinks.0.note.title', 'Source note')
            ->where('backlinks.0.href', "/notes/{$source->id}#p-source"),
        );
});

test('backlinks omit task blocks that already appear in related tasks', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target note',
    ]);

    $source = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source mixed',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['id' => 'h-mixed', 'level' => 2],
                    'content' => [
                        ['type' => 'text', 'text' => 'Section'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => ['id' => 'p-mixed'],
                    'content' => [
                        ['type' => 'text', 'text' => 'Paragraph link to '],
                        [
                            'type' => 'text',
                            'text' => 'Target note',
                            'marks' => [[
                                'type' => 'wikiLink',
                                'attrs' => [
                                    'noteId' => $target->id,
                                    'href' => "/notes/{$target->id}",
                                ],
                            ]],
                        ],
                    ],
                ],
                [
                    'type' => 'taskList',
                    'content' => [[
                        'type' => 'taskItem',
                        'attrs' => ['id' => 'task-mixed', 'checked' => false],
                        'content' => [[
                            'type' => 'paragraph',
                            'attrs' => ['id' => 'task-mixed-p'],
                            'content' => [
                                ['type' => 'text', 'text' => 'Task link to '],
                                [
                                    'type' => 'text',
                                    'text' => 'Target note',
                                    'marks' => [[
                                        'type' => 'wikiLink',
                                        'attrs' => [
                                            'noteId' => $target->id,
                                            'href' => "/notes/{$target->id}",
                                        ],
                                    ]],
                                ],
                            ],
                        ]],
                    ]],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get("/notes/{$target->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->has('relatedTasks', 1)
            ->where('relatedTasks.0.note_id', $source->id)
            ->where('relatedTasks.0.block_id', 'task-mixed')
            ->has('backlinks', 1)
            ->where('backlinks.0.block_id', 'p-mixed')
            ->where('backlinks.0.note.id', $source->id),
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
