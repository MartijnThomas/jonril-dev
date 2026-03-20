<?php

use App\Models\User;

test('registration screen can be rendered', function () {
    $response = $this->get(route('register'));

    $response->assertOk();
});

test('new users can register', function () {
    $response = $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'martijn@mthomas.nl',
        'password' => 'password',
        'password_confirmation' => 'password',
    ]);

    $this->assertAuthenticated();
    $response->assertRedirect(route('journal.landing', absolute: false));
});

test('registration creates a default owned workspace and selects it', function () {
    $this->post(route('register.store'), [
        'name' => 'Test User',
        'email' => 'martijn@globe-view.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertRedirect(route('journal.landing', absolute: false));

    /** @var User $user */
    $user = User::query()->where('email', 'martijn@globe-view.com')->firstOrFail();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not->toBeNull();
    expect($workspace?->owner_id)->toBe($user->id);
    expect($workspace?->is_personal)->toBeTrue();
    expect($workspace?->name)->toBe('Test User Workspace');
    expect(data_get($user->settings, 'workspace_id'))->toBe($workspace?->id);

    expect(
        $user->workspaces()
            ->where('workspaces.id', $workspace?->id)
            ->wherePivot('role', 'owner')
            ->exists()
    )->toBeTrue();
});

test('registration is unauthorized for emails outside the allowlist', function () {
    $this->post(route('register.store'), [
        'name' => 'Blocked User',
        'email' => 'blocked@example.com',
        'password' => 'password',
        'password_confirmation' => 'password',
    ])->assertForbidden();

    $this->assertGuest();
    expect(User::query()->where('email', 'blocked@example.com')->exists())->toBeFalse();
});
