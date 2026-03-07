<?php

use App\Models\User;

test('workspace suggestion endpoint adds mention and dedupes case-insensitive', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not->toBeNull();

    $this
        ->actingAs($user)
        ->postJson('/workspaces/suggestions', [
            'kind' => 'mention',
            'value' => 'Lea_Thompson',
        ])
        ->assertOk()
        ->assertJsonPath('kind', 'mention')
        ->assertJsonPath('items.0', 'Lea_Thompson');

    $this
        ->actingAs($user)
        ->postJson('/workspaces/suggestions', [
            'kind' => 'mention',
            'value' => 'lea_thompson',
        ])
        ->assertOk();

    $workspace?->refresh();
    expect($workspace?->mention_suggestions)->toBe(['Lea_Thompson']);
});

test('workspace suggestion endpoint adds hashtag and rejects spaces', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not->toBeNull();

    $this
        ->actingAs($user)
        ->postJson('/workspaces/suggestions', [
            'kind' => 'hashtag',
            'value' => 'work-item',
        ])
        ->assertOk()
        ->assertJsonPath('kind', 'hashtag');

    $this
        ->actingAs($user)
        ->postJson('/workspaces/suggestions', [
            'kind' => 'hashtag',
            'value' => 'work item',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('value');

    $workspace?->refresh();
    expect($workspace?->hashtag_suggestions)->toBe(['work-item']);
});
