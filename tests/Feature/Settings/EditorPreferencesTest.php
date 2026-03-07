<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('editor preferences page is displayed', function () {
    $user = User::factory()->create();

    $this
        ->actingAs($user)
        ->get(route('editor-preferences.edit'))
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/editor-preferences')
            ->where('preferences.sidebar_left_open_default', true)
            ->where('preferences.sidebar_right_open_default', true),
        );
});

test('editor preferences can be updated', function () {
    $user = User::factory()->create();

    $this
        ->actingAs($user)
        ->patch(route('editor-preferences.update'), [
            'sidebar_left_open_default' => false,
            'sidebar_right_open_default' => true,
        ])
        ->assertSessionHasNoErrors()
        ->assertRedirect(route('editor-preferences.edit'));

    $user->refresh();

    expect(data_get($user->settings, 'editor.sidebar_left_open_default'))->toBeFalse();
    expect(data_get($user->settings, 'editor.sidebar_right_open_default'))->toBeTrue();
});
