<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use Illuminate\Http\Request;
use Inertia\Testing\AssertableInertia as Assert;

test('workspace scoped note url resolves note by slug', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not()->toBeNull();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'slug' => 'project-1',
    ]);

    expect($workspace->notes()->where('slug', $note->slug)->exists())->toBeTrue();
    $resolvedViaService = app(NoteSlugService::class)->findByReference($workspace, $note->slug);
    expect($resolvedViaService?->id)->toBe($note->id);

    $url = route('notes.show', [
        'workspace' => $workspace->slug,
        'note' => $note->slug,
    ], absolute: false);

    expect($url)->toBe("/w/{$workspace->slug}/notes/{$note->slug}");
    $matched = app('router')->getRoutes()->match(Request::create($url, 'GET'));
    expect($matched->parameter('workspace'))->toBe($workspace->slug);
    expect($matched->parameter('note'))->toBe($note->slug);

    $response = $this
        ->actingAs($user)
        ->get($url);

    $response->assertRedirect("/w/{$workspace->slug}/notes/{$note->id}");

    $this
        ->actingAs($user)
        ->get("/w/{$workspace->slug}/notes/{$note->id}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $note->id)
            ->where('noteUrl', "/w/{$workspace->slug}/notes/{$note->id}")
            ->where('noteUpdateUrl', "/w/{$workspace->slug}/notes/{$note->id}"));
});

test('workspace scoped note url resolves note by nested slug', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not()->toBeNull();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
        'slug' => 'acme',
    ]);

    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'slug' => 'acme/project-1',
        'parent_id' => $parent->id,
    ]);

    $this
        ->actingAs($user)
        ->get(route('notes.show', [
            'workspace' => $workspace->slug,
            'note' => $child->slug,
        ], absolute: false))
        ->assertRedirect("/w/{$workspace->slug}/notes/{$child->id}");

    $this
        ->actingAs($user)
        ->get("/w/{$workspace->slug}/notes/{$child->id}")
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $child->id)
            ->where('noteUrl', "/w/{$workspace->slug}/notes/{$child->id}"));
});

test('workspace scoped journal url resolves for workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not()->toBeNull();

    $response = $this
        ->actingAs($user)
        ->get(route('journal.show', [
            'workspace' => $workspace->slug,
            'granularity' => 'daily',
            'period' => '2026-03-10',
        ], absolute: false));

    $response->assertOk();
    $response->assertInertia(fn (Assert $page) => $page
        ->where('noteType', Note::TYPE_JOURNAL)
        ->where('journalGranularity', 'daily')
        ->where('journalPeriod', '2026-03-10'));
});

test('workspace scoped simplified journal period url resolves for workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not()->toBeNull();

    $response = $this
        ->actingAs($user)
        ->get(route('journal.show.by-period', [
            'workspace' => $workspace->slug,
            'period' => '2026-03',
        ], absolute: false));

    $response->assertOk();
    $response->assertInertia(fn (Assert $page) => $page
        ->where('noteType', Note::TYPE_JOURNAL)
        ->where('journalGranularity', 'monthly')
        ->where('journalPeriod', '2026-03'));
});

test('workspace scoped journal url redirects to personal workspace when scoped workspace is non-personal', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $otherWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $otherWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $this
        ->actingAs($user)
        ->get(route('journal.show', [
            'workspace' => $otherWorkspace->slug,
            'granularity' => 'daily',
            'period' => '2026-03-10',
        ], absolute: false))
        ->assertRedirect(route('journal.show', [
            'workspace' => $personalWorkspace?->slug,
            'granularity' => 'daily',
            'period' => '2026-03-10',
        ], absolute: false));
});

test('workspace scoped simplified journal period url redirects to personal workspace when scoped workspace is non-personal', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $otherWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $otherWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $this
        ->actingAs($user)
        ->get(route('journal.show.by-period', [
            'workspace' => $otherWorkspace->slug,
            'period' => '2026-03',
        ], absolute: false))
        ->assertRedirect(route('journal.show.by-period', [
            'workspace' => $personalWorkspace?->slug,
            'period' => '2026-03',
        ], absolute: false));
});

test('workspace scoped note url returns 403 for non member workspace', function () {
    $owner = User::factory()->create();
    $outsider = User::factory()->create();

    $workspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'name' => 'Owner Workspace',
    ]);
    $workspace->users()->syncWithoutDetaching([$owner->id => ['role' => 'owner']]);

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Private note',
        'slug' => 'private-note',
    ]);

    $response = $this
        ->actingAs($outsider)
        ->get(route('notes.show', [
            'workspace' => $workspace->slug,
            'note' => $note->slug,
        ], absolute: false));

    $response->assertForbidden();
});

test('workspace scoped update preserves leading and trailing spaces in tiptap text nodes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not()->toBeNull();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Spacing test',
        'slug' => 'spacing-test',
    ]);

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
        ->put(route('notes.update', [
            'workspace' => $workspace->slug,
            'note' => $note->id,
        ], absolute: false), [
            'content' => $content,
            'properties' => [],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect(data_get($note->content, 'content.0.content.0.text'))->toBe('before ');
    expect(data_get($note->content, 'content.0.content.2.text'))->toBe(' and ');
    expect(data_get($note->content, 'content.0.content.4.text'))->toBe(' after');
});
