<?php

use App\Models\User;

test('i18n ui endpoint returns translation payload with version for authenticated user', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);

    $this
        ->actingAs($user)
        ->getJson('/i18n/ui')
        ->assertOk()
        ->assertJsonPath('locale', 'en')
        ->assertJsonPath('unchanged', false)
        ->assertJsonPath('ui.tasks_index.page_title', 'Tasks')
        ->assertJson(fn (\Illuminate\Testing\Fluent\AssertableJson $json) => $json
            ->whereType('version', 'string')
            ->etc());
});

test('i18n ui endpoint supports version check and returns unchanged response', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);

    $first = $this
        ->actingAs($user)
        ->getJson('/i18n/ui')
        ->assertOk()
        ->json();

    $version = (string) ($first['version'] ?? '');
    expect($version)->not->toBe('');

    $this
        ->actingAs($user)
        ->getJson('/i18n/ui?version='.urlencode($version))
        ->assertOk()
        ->assertJsonPath('locale', 'en')
        ->assertJsonPath('version', $version)
        ->assertJsonPath('unchanged', true)
        ->assertJsonMissingPath('ui');
});
