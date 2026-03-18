<?php

use App\Models\Note;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

// ─── Ping endpoint ────────────────────────────────────────────────────────────

test('ping returns no content when authenticated', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->get('/ping')
        ->assertNoContent();
});

test('ping redirects to login when not authenticated', function () {
    $this->get('/ping')->assertRedirectToRoute('login');
});

// ─── Content hash stored on save ─────────────────────────────────────────────

test('saving a note stores content_hash in meta', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Hash test',
        'slug' => 'hash-test',
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            ['type' => 'heading', 'attrs' => ['level' => 1], 'content' => [['type' => 'text', 'text' => 'Hash test']]],
        ],
    ];

    $this->actingAs($user)
        ->putJson("/w/{$workspace->slug}/notes/{$note->id}", ['content' => $content])
        ->assertSuccessful();

    $note->refresh();

    expect($note->meta['content_hash'])->toBe(hash('sha256', json_encode($content)));
});

test('saving a note with new content updates the stored content_hash', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $originalContent = [
        'type' => 'doc',
        'content' => [
            ['type' => 'heading', 'attrs' => ['level' => 1], 'content' => [['type' => 'text', 'text' => 'Original']]],
        ],
    ];

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Original',
        'slug' => 'original',
        'content' => $originalContent,
        'meta' => ['content_hash' => hash('sha256', json_encode($originalContent))],
    ]);

    $updatedContent = [
        'type' => 'doc',
        'content' => [
            ['type' => 'heading', 'attrs' => ['level' => 1], 'content' => [['type' => 'text', 'text' => 'Updated']]],
        ],
    ];

    $this->actingAs($user)
        ->putJson("/w/{$workspace->slug}/notes/{$note->id}", ['content' => $updatedContent])
        ->assertSuccessful();

    $note->refresh();

    $expectedHash = hash('sha256', json_encode($updatedContent));
    expect($note->meta['content_hash'])->toBe($expectedHash);
    expect($note->meta['content_hash'])->not()->toBe(hash('sha256', json_encode($originalContent)));
});

test('saving a note preserves existing meta fields alongside content_hash', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Meta test',
        'slug' => 'meta-test',
        'meta' => ['custom_key' => 'should_survive'],
    ]);

    $content = ['type' => 'doc', 'content' => []];

    $this->actingAs($user)
        ->putJson("/w/{$workspace->slug}/notes/{$note->id}", ['content' => $content])
        ->assertSuccessful();

    $note->refresh();

    expect($note->meta['custom_key'])->toBe('should_survive');
    expect($note->meta)->toHaveKey('content_hash');
});

// ─── Hash endpoint ────────────────────────────────────────────────────────────

test('hash endpoint returns the stored content_hash', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $content = ['type' => 'doc', 'content' => []];
    $hash = hash('sha256', json_encode($content));

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Stored hash',
        'slug' => 'stored-hash',
        'content' => $content,
        'meta' => ['content_hash' => $hash],
    ]);

    $this->actingAs($user)
        ->getJson("/w/{$workspace->slug}/notes/{$note->id}/hash")
        ->assertOk()
        ->assertJson(['hash' => $hash]);
});

test('hash endpoint computes hash on the fly for notes without stored content_hash', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $content = [
        'type' => 'doc',
        'content' => [
            ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'No hash yet']]],
        ],
    ];

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'No hash',
        'slug' => 'no-hash',
        'content' => $content,
    ]);

    $response = $this->actingAs($user)
        ->getJson("/w/{$workspace->slug}/notes/{$note->id}/hash")
        ->assertOk();

    expect($response->json('hash'))->not()->toBeEmpty();
});

test('hash endpoint returns 401 for unauthenticated requests', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Secret',
        'slug' => 'secret',
    ]);

    $this->getJson("/w/{$workspace->slug}/notes/{$note->id}/hash")
        ->assertUnauthorized();
});

test('hash endpoint returns 404 for a note belonging to another workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $otherUser = User::factory()->create();
    $otherWorkspace = $otherUser->currentWorkspace();
    $otherNote = $otherWorkspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Other',
        'slug' => 'other',
    ]);

    $this->actingAs($user)
        ->getJson("/w/{$workspace->slug}/notes/{$otherNote->id}/hash")
        ->assertNotFound();
});

// ─── Show page props ──────────────────────────────────────────────────────────

test('note show page includes contentHash and noteHashUrl props', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $content = ['type' => 'doc', 'content' => []];
    $hash = hash('sha256', json_encode($content));

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Props test',
        'slug' => 'props-test',
        'content' => $content,
        'meta' => ['content_hash' => $hash],
    ]);

    $this->actingAs($user)
        ->get("/w/{$workspace->slug}/notes/{$note->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->where('contentHash', $hash)
            ->where('noteHashUrl', "/w/{$workspace->slug}/notes/{$note->id}/hash"),
        );
});

test('note show page passes empty noteHashUrl for read-only migrated workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace->forceFill(['migrated_at' => now()])->save();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Read only',
        'slug' => 'read-only',
    ]);

    $this->actingAs($user)
        ->get("/w/{$workspace->slug}/notes/{$note->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteHashUrl', ''),
        );
});
