<?php

use App\Models\User;
use App\Models\Workspace;
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

test('journal and notes landing use personal workspace when active workspace is non-personal', function () {
    CarbonImmutable::setTestNow('2026-03-07 10:00:00');

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

    $this->actingAs($user->fresh());

    $this->get(route('journal.landing'))
        ->assertRedirect(route('journal.show.by-period', [
            'workspace' => $personalWorkspace?->slug,
            'period' => '2026-03-07',
        ], absolute: false));

    $this->get(route('notes.landing'))
        ->assertRedirect(route('journal.show.by-period', [
            'workspace' => $personalWorkspace?->slug,
            'period' => '2026-03-07',
        ], absolute: false));

    CarbonImmutable::setTestNow();
});
