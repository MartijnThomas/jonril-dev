<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('workspace owner can view workspace settings page', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->get('/workspaces/settings')
        ->assertInertia(fn (Assert $page) => $page
            ->component('workspaces/settings')
            ->where('workspace.id', $workspace?->id),
        );
});

test('workspace owner can update workspace name', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->patch('/workspaces/settings', [
            'name' => 'Product Team',
        ])
        ->assertRedirect();

    expect($workspace?->fresh()?->name)->toBe('Product Team');
});

test('workspace owner can add and remove members', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $member = User::factory()->create();

    $this
        ->actingAs($owner)
        ->post('/workspaces/settings/members', [
            'email' => $member->email,
        ])
        ->assertRedirect();

    expect($workspace?->users()->where('users.id', $member->id)->exists())->toBeTrue();

    $this
        ->actingAs($owner)
        ->delete('/workspaces/settings/members', [
            'user_id' => $member->id,
        ])
        ->assertRedirect();

    expect($workspace?->users()->where('users.id', $member->id)->exists())->toBeFalse();
});

test('non-owner cannot manage workspace settings', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $member = User::factory()->create();

    $workspace?->users()->syncWithoutDetaching([
        $member->id => ['role' => 'member'],
    ]);
    $member->forceFill([
        'settings' => [
            ...(is_array($member->settings) ? $member->settings : []),
            'workspace_id' => $workspace?->id,
        ],
    ])->save();

    $this->actingAs($member)->get('/workspaces/settings')->assertForbidden();
    $this->actingAs($member)->patch('/workspaces/settings', ['name' => 'X'])->assertForbidden();
    $this->actingAs($member)->post('/workspaces/settings/members', ['email' => $owner->email])->assertForbidden();
    $this->actingAs($member)->delete('/workspaces/settings/members', ['user_id' => $owner->id])->assertForbidden();
});

test('workspace owner can transfer ownership by setting a member role to owner', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $member = User::factory()->create();

    $workspace?->users()->syncWithoutDetaching([
        $member->id => ['role' => 'member'],
    ]);

    $this
        ->actingAs($owner)
        ->patch('/workspaces/settings/members/role', [
            'user_id' => $member->id,
            'role' => 'owner',
        ])
        ->assertRedirect();

    $workspace?->refresh();

    expect($workspace?->owner_id)->toBe($member->id);
    expect(
        $workspace?->users()
            ->where('users.id', $member->id)
            ->first()?->pivot?->role
    )->toBe('owner');
});

test('workspace owner can create a new workspace', function () {
    $owner = User::factory()->create();

    $this
        ->actingAs($owner)
        ->post('/workspaces', [
            'name' => 'New Workspace',
        ])
        ->assertRedirect(route('journal.landing', absolute: false));

    $workspace = $owner->fresh()?->workspaces()->where('name', 'New Workspace')->first();

    expect($workspace)->not->toBeNull();
});
