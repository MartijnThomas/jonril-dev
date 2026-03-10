<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('workspace owner can view workspace settings page', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->get(route('workspaces.settings.edit', ['workspace' => $workspace?->id], absolute: false))
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
        ->patch(route('workspaces.settings.update', ['workspace' => $workspace?->id], absolute: false), [
            'name' => 'Product Team',
        ])
        ->assertRedirect();

    expect($workspace?->fresh()?->name)->toBe('Product Team');
});

test('workspace owner can update workspace timeblock color', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->patch(route('workspaces.settings.update', ['workspace' => $workspace?->id], absolute: false), [
            'name' => $workspace?->name,
            'color' => $workspace?->color,
            'icon' => $workspace?->icon,
            'timeblock_color' => 'emerald',
        ])
        ->assertRedirect();

    expect($workspace?->fresh()?->timeblock_color)->toBe('emerald');
});

test('workspace owner can add and remove members', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $member = User::factory()->create();

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.members.add', ['workspace' => $workspace?->id], absolute: false), [
            'email' => $member->email,
        ])
        ->assertRedirect();

    expect($workspace?->users()->where('users.id', $member->id)->exists())->toBeTrue();

    $this
        ->actingAs($owner)
        ->delete(route('workspaces.settings.members.remove', ['workspace' => $workspace?->id], absolute: false), [
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

    $this->actingAs($member)->get(route('workspaces.settings.edit', ['workspace' => $workspace?->id], absolute: false))->assertForbidden();
    $this->actingAs($member)->patch(route('workspaces.settings.update', ['workspace' => $workspace?->id], absolute: false), ['name' => 'X'])->assertForbidden();
    $this->actingAs($member)->post(route('workspaces.settings.members.add', ['workspace' => $workspace?->id], absolute: false), ['email' => $owner->email])->assertForbidden();
    $this->actingAs($member)->delete(route('workspaces.settings.members.remove', ['workspace' => $workspace?->id], absolute: false), ['user_id' => $owner->id])->assertForbidden();
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
        ->patch(route('workspaces.settings.members.role', ['workspace' => $workspace?->id], absolute: false), [
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
