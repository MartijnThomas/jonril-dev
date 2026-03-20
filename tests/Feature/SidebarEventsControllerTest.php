<?php

use App\Models\Event;
use App\Models\Timeblock;
use App\Models\User;
use App\Models\Workspace;
use Inertia\Testing\AssertableInertia as Assert;

test('journal page keeps active workspace while sidebar events endpoint can fetch personal workspace events', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $activeWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $activeWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $user->forceFill([
        'settings' => [
            ...(is_array($user->settings) ? $user->settings : []),
            'workspace_id' => $activeWorkspace->id,
        ],
    ])->save();

    $personalTimeblock = Timeblock::query()->create([
        'location' => 'Personal room',
    ]);
    Event::query()->create([
        'workspace_id' => $personalWorkspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $personalTimeblock->id,
        'title' => 'Personal event',
        'starts_at' => '2026-03-07 09:00:00',
        'ends_at' => '2026-03-07 10:00:00',
        'timezone' => 'Europe/Amsterdam',
        'journal_date' => '2026-03-07',
    ]);

    $activeTimeblock = Timeblock::query()->create([
        'location' => 'Team room',
    ]);
    Event::query()->create([
        'workspace_id' => $activeWorkspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $activeTimeblock->id,
        'title' => 'Active workspace event',
        'starts_at' => '2026-03-07 11:00:00',
        'ends_at' => '2026-03-07 12:00:00',
        'timezone' => 'Europe/Amsterdam',
        'journal_date' => '2026-03-07',
    ]);

    $this
        ->actingAs($user->fresh())
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('currentWorkspace.id', $activeWorkspace->id)
            ->where('personalWorkspace.id', $personalWorkspace?->id),
        );

    $response = $this
        ->actingAs($user->fresh())
        ->getJson("/w/{$personalWorkspace->slug}/events?date=2026-03-07")
        ->assertOk();

    $events = collect((array) $response->json('events'));
    expect($events->pluck('title')->all())->toContain('Personal event');
    expect($events->pluck('title')->all())->not->toContain('Active workspace event');
});

test('sidebar events endpoint returns forbidden for non-member workspace', function () {
    $owner = User::factory()->create();
    $outsider = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($outsider)
        ->getJson("/w/{$workspace->slug}/events?date=2026-03-07")
        ->assertForbidden();
});
