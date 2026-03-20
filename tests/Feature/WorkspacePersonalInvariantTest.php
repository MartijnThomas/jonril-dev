<?php

use App\Models\User;
use App\Models\Workspace;

test('promoting a workspace to personal demotes other personal workspaces for same owner', function () {
    $user = User::factory()->create();
    $originalPersonal = Workspace::query()
        ->where('owner_id', $user->id)
        ->where('is_personal', true)
        ->first();

    expect($originalPersonal)->not->toBeNull();

    $otherWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
        'name' => 'Secondary Workspace',
    ]);

    $otherWorkspace->update([
        'is_personal' => true,
    ]);

    expect($otherWorkspace->fresh()?->is_personal)->toBeTrue();
    expect($originalPersonal?->fresh()?->is_personal)->toBeFalse();
    expect(
        Workspace::query()
            ->where('owner_id', $user->id)
            ->where('is_personal', true)
            ->count(),
    )->toBe(1);
});

test('demoting the only personal workspace is blocked', function () {
    $user = User::factory()->create();
    $personalWorkspace = Workspace::query()
        ->where('owner_id', $user->id)
        ->where('is_personal', true)
        ->first();

    expect($personalWorkspace)->not->toBeNull();

    expect(fn () => $personalWorkspace?->update([
        'is_personal' => false,
    ]))->toThrow(LogicException::class);

    expect($personalWorkspace?->fresh()?->is_personal)->toBeTrue();
});
