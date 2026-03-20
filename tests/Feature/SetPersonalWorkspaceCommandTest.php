<?php

use App\Models\User;
use App\Models\Workspace;

test('set personal workspace command moves personal flag from old workspace to selected workspace', function () {
    $user = User::factory()->create();
    $oldPersonalWorkspace = $user->currentWorkspace();

    $newWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $newWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $this->artisan('workspaces:set-personal', [
        '--user' => $user->email,
        '--workspace' => $newWorkspace->id,
        '--force' => true,
    ])->assertExitCode(0);

    expect($oldPersonalWorkspace?->fresh()?->is_personal)->toBeFalse();
    expect($newWorkspace->fresh()?->is_personal)->toBeTrue();
});

test('set personal workspace command only updates workspaces owned by selected user', function () {
    $user = User::factory()->create();
    $otherUser = User::factory()->create();

    $targetWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $targetWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $otherUserPersonalWorkspace = $otherUser->currentWorkspace();

    $this->artisan('workspaces:set-personal', [
        '--user' => $user->id,
        '--workspace' => $targetWorkspace->slug,
        '--force' => true,
    ])->assertExitCode(0);

    expect($targetWorkspace->fresh()?->is_personal)->toBeTrue();
    expect($otherUserPersonalWorkspace?->fresh()?->is_personal)->toBeTrue();
});
