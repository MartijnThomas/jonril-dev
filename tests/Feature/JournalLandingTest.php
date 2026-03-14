<?php

use App\Models\User;
use Carbon\CarbonImmutable;

test('guests are redirected to the login page for journal landing', function () {
    $response = $this->get(route('journal.landing'));
    $response->assertRedirect(route('login'));
});

test('journal landing redirects authenticated users to today daily note', function () {
    CarbonImmutable::setTestNow('2026-03-07 10:00:00');

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $this->actingAs($user);

    $response = $this->get(route('journal.landing'));

    $response->assertRedirect(route('journal.show.by-period', [
        'workspace' => $workspace?->slug,
        'period' => '2026-03-07',
    ], absolute: false));

    CarbonImmutable::setTestNow();
});

test('notes landing redirects authenticated users to today daily note', function () {
    CarbonImmutable::setTestNow('2026-03-07 10:00:00');

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $this->actingAs($user);

    $response = $this->get(route('notes.landing'));

    $response->assertRedirect(route('journal.show.by-period', [
        'workspace' => $workspace?->slug,
        'period' => '2026-03-07',
    ], absolute: false));

    CarbonImmutable::setTestNow();
});
