<?php

use App\Models\User;
use App\Models\Workspace;

test('user can switch to a workspace they belong to', function () {
    $user = User::factory()->create();

    $targetWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'name' => 'Target Workspace',
    ]);

    $user->workspaces()->syncWithoutDetaching([
        $targetWorkspace->id => ['role' => 'owner'],
    ]);

    $this
        ->actingAs($user)
        ->post(route('workspaces.switch', absolute: false), [
            'workspace_id' => $targetWorkspace->id,
        ])
        ->assertRedirect(route('journal.landing', absolute: false));

    $user->refresh();

    expect(data_get($user->settings, 'workspace_id'))->toBe($targetWorkspace->id);
});

test('user cannot switch to workspace they do not belong to', function () {
    $user = User::factory()->create();
    $otherOwner = User::factory()->create();

    $otherWorkspace = Workspace::factory()->create([
        'owner_id' => $otherOwner->id,
    ]);

    $this
        ->actingAs($user)
        ->post(route('workspaces.switch', absolute: false), [
            'workspace_id' => $otherWorkspace->id,
        ])
        ->assertSessionHasErrors('workspace_id');
});
