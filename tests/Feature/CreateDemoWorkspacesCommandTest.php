<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

test('create demo workspaces command creates both workspaces and linked demo notes', function () {
    $user = User::factory()->create([
        'email' => 'demo-owner@example.com',
    ]);

    $this->artisan('workspaces:create-demo-notes', [
        'email' => $user->email,
        '--force' => true,
    ])->assertExitCode(0);

    $demoWorkspace = Workspace::query()
        ->where('owner_id', $user->id)
        ->where('name', 'Demo Workspace')
        ->first();
    $referenceWorkspace = Workspace::query()
        ->where('owner_id', $user->id)
        ->where('name', 'Demo Reference Workspace')
        ->first();

    expect($demoWorkspace)->not->toBeNull();
    expect($referenceWorkspace)->not->toBeNull();
    expect($demoWorkspace?->editor_mode)->toBe(Workspace::EDITOR_MODE_BLOCK);
    expect($referenceWorkspace?->editor_mode)->toBe(Workspace::EDITOR_MODE_BLOCK);

    $kitchenSinkNote = Note::query()
        ->where('workspace_id', $demoWorkspace?->id)
        ->where('title', 'Kitchen Sink Note')
        ->first();
    $referenceNote = Note::query()
        ->where('workspace_id', $referenceWorkspace?->id)
        ->where('title', 'Kitchen Sink Reference Note')
        ->first();
    $normalWikiLinkNote = Note::query()
        ->where('workspace_id', $demoWorkspace?->id)
        ->where('title', 'Normal Wiki-link Note')
        ->first();

    expect($kitchenSinkNote)->not->toBeNull();
    expect($referenceNote)->not->toBeNull();
    expect($normalWikiLinkNote)->not->toBeNull();

    $kitchenSinkMarks = collect(collectWikiLinkMarks($kitchenSinkNote?->content ?? []));
    $referenceMarks = collect(collectWikiLinkMarks($referenceNote?->content ?? []));
    $normalMarks = collect(collectWikiLinkMarks($normalWikiLinkNote?->content ?? []));
    $kitchenSinkHighlights = collect(collectHighlightMarks($kitchenSinkNote?->content ?? []));
    $referenceHighlights = collect(collectHighlightMarks($referenceNote?->content ?? []));
    $normalHighlights = collect(collectHighlightMarks($normalWikiLinkNote?->content ?? []));

    expect($kitchenSinkMarks->contains(
        fn (array $mark): bool => ($mark['attrs']['noteId'] ?? null) === $referenceNote?->id
            && ($mark['attrs']['crossWorkspace'] ?? null) === true
            && is_string($mark['attrs']['href'] ?? null)
            && str_contains((string) $mark['attrs']['href'], "/w/{$referenceWorkspace?->slug}/notes/{$referenceNote?->id}"),
    ))->toBeTrue();

    expect($referenceMarks->contains(
        fn (array $mark): bool => ($mark['attrs']['noteId'] ?? null) === $kitchenSinkNote?->id
            && ($mark['attrs']['crossWorkspace'] ?? null) === true
            && is_string($mark['attrs']['href'] ?? null)
            && str_contains((string) $mark['attrs']['href'], "/w/{$demoWorkspace?->slug}/notes/{$kitchenSinkNote?->id}"),
    ))->toBeTrue();

    expect($normalMarks->contains(
        fn (array $mark): bool => ($mark['attrs']['noteId'] ?? null) === $kitchenSinkNote?->id
            && ($mark['attrs']['crossWorkspace'] ?? null) === false,
    ))->toBeTrue();

    expect($kitchenSinkHighlights->pluck('attrs.color')->all())
        ->toContain('var(--tt-color-highlight-yellow)')
        ->toContain('var(--tt-color-highlight-blue)')
        ->toContain('var(--tt-color-highlight-red)');

    expect($referenceHighlights->pluck('attrs.color')->all())
        ->toContain('var(--tt-color-highlight-green)')
        ->toContain('var(--tt-color-highlight-purple)')
        ->toContain('var(--tt-color-highlight-orange)')
        ->toContain('var(--tt-color-highlight-pink)');

    expect($normalHighlights->pluck('attrs.color')->all())
        ->toContain('var(--tt-color-highlight-gray)')
        ->toContain('var(--tt-color-highlight-brown)');
});

test('create demo workspaces command fails for unknown user email', function () {
    $this->artisan('workspaces:create-demo-notes', [
        'email' => 'unknown@example.com',
        '--force' => true,
    ])->assertExitCode(1);
});

/**
 * @return array<int, array<string, mixed>>
 */
function collectWikiLinkMarks(array $node): array
{
    $found = [];
    $content = $node['content'] ?? [];

    if (! is_array($content)) {
        return $found;
    }

    foreach ($content as $child) {
        if (! is_array($child)) {
            continue;
        }

        $marks = $child['marks'] ?? [];
        if (is_array($marks)) {
            foreach ($marks as $mark) {
                if (is_array($mark) && ($mark['type'] ?? null) === 'wikiLink') {
                    $found[] = $mark;
                }
            }
        }

        $found = [...$found, ...collectWikiLinkMarks($child)];
    }

    return $found;
}

/**
 * @return array<int, array<string, mixed>>
 */
function collectHighlightMarks(array $node): array
{
    $found = [];
    $content = $node['content'] ?? [];

    if (! is_array($content)) {
        return $found;
    }

    foreach ($content as $child) {
        if (! is_array($child)) {
            continue;
        }

        $marks = $child['marks'] ?? [];
        if (is_array($marks)) {
            foreach ($marks as $mark) {
                if (is_array($mark) && ($mark['type'] ?? null) === 'highlight') {
                    $found[] = $mark;
                }
            }
        }

        $found = [...$found, ...collectHighlightMarks($child)];
    }

    return $found;
}
