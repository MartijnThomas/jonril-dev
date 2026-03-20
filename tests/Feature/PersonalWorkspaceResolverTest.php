<?php

use App\Models\User;
use App\Models\Workspace;
use App\Support\Workspaces\PersonalWorkspaceResolver;

test('resolver returns personal workspace for user with single workspace', function () {
    $user = User::factory()->create();

    $resolved = app(PersonalWorkspaceResolver::class)->resolveFor($user);

    expect($resolved)->not()->toBeNull();
    expect($resolved?->id)->toBe($user->currentWorkspace()?->id);
    expect($resolved?->isPersonal())->toBeTrue();
});

test('resolver returns personal workspace when user has multiple workspaces', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $otherWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $otherWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $user->forceFill([
        'settings' => [
            ...(is_array($user->settings) ? $user->settings : []),
            'workspace_id' => $otherWorkspace->id,
        ],
    ])->save();

    $resolved = app(PersonalWorkspaceResolver::class)->resolveFor($user->fresh());

    expect($resolved)->not()->toBeNull();
    expect($resolved?->id)->toBe($personalWorkspace?->id);
    expect($resolved?->isPersonal())->toBeTrue();
});

test('resolver falls back to current workspace when personal workspace flag is missing', function () {
    $user = User::factory()->create();
    $originalWorkspace = $user->currentWorkspace();

    $workspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    if ($originalWorkspace) {
        Workspace::query()
            ->whereKey($originalWorkspace->id)
            ->update([
                'is_personal' => false,
            ]);
    }

    $user->forceFill([
        'settings' => [
            ...(is_array($user->settings) ? $user->settings : []),
            'workspace_id' => $workspace->id,
        ],
    ])->save();

    $resolved = app(PersonalWorkspaceResolver::class)->resolveFor($user->fresh());

    expect($resolved)->not()->toBeNull();
    expect($resolved?->id)->toBe($workspace->id);
    expect($resolved?->isPersonal())->toBeFalse();
});
