<?php

use App\Jobs\SyncTimeblockCreateJob;
use App\Jobs\SyncTimeblockUpdateJob;
use App\Models\Calendar;
use App\Models\CalendarConnection;
use App\Models\Note;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;
use Inertia\Testing\AssertableInertia as Assert;

test('workspace owner can view workspace settings page', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->get(route('workspaces.settings.edit', ['workspace' => $workspace?->id], absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->component('workspaces/settings')
            ->where('workspace.id', $workspace?->id)
            ->where('workspace.editor_mode', 'legacy')
            ->where('workspace.can_migrate_to_block', true)
            ->where('workspace.is_migrated_source', false),
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

test('workspace owner can update workspace editor mode', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->patch(route('workspaces.settings.update', ['workspace' => $workspace?->id], absolute: false), [
            'name' => $workspace?->name,
            'color' => $workspace?->color,
            'icon' => $workspace?->icon,
            'timeblock_color' => $workspace?->timeblock_color,
            'editor_mode' => 'block',
        ])
        ->assertRedirect();

    expect($workspace?->fresh()?->editor_mode)->toBe('block');
});

test('workspace owner cannot update workspace editor mode to deprecated block tree', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->patch(route('workspaces.settings.update', ['workspace' => $workspace?->id], absolute: false), [
            'name' => $workspace?->name,
            'color' => $workspace?->color,
            'icon' => $workspace?->icon,
            'timeblock_color' => $workspace?->timeblock_color,
            'editor_mode' => 'block_tree',
        ])
        ->assertSessionHasErrors('editor_mode');

    expect($workspace?->fresh()?->editor_mode)->toBe('legacy');
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
    $workspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $owner->id => ['role' => 'owner'],
    ]);
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

test('workspace owner cannot transfer ownership for personal workspace', function () {
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
        ->assertSessionHasErrors('role');

    expect($workspace?->fresh()?->owner_id)->toBe($owner->id);
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
    expect($workspace?->is_personal)->toBeFalse();
});

test('workspace owner can trigger legacy workspace migration to block', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $workspace?->update(['editor_mode' => Workspace::EDITOR_MODE_LEGACY]);

    $copiedWorkspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'name' => $workspace?->name.' (Block)',
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ]);
    Note::factory()->create([
        'workspace_id' => $copiedWorkspace->id,
        'type' => Note::TYPE_NOTE,
    ]);
    Note::factory()->create([
        'workspace_id' => $copiedWorkspace->id,
        'type' => Note::TYPE_JOURNAL,
    ]);

    Artisan::shouldReceive('call')
        ->once()
        ->with('notes:convert-workspace-to-block', [
            '--workspace' => $workspace?->id,
            '--force' => true,
        ])
        ->andReturn(0);

    $response = $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.migrate', ['workspace' => $workspace?->id], absolute: false))
        ->assertRedirect()
        ->assertSessionHas('status', 'workspace-migrated');

    $response->assertSessionHas('migration_summary.workspace.id', $copiedWorkspace->id);
    $response->assertSessionHas('migration_summary.notes.total', 2);
    $response->assertSessionHas('migration_summary.notes.normal', 1);
    $response->assertSessionHas('migration_summary.notes.journal', 1);
});

test('workspace owner cannot trigger migration for block workspace', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $workspace?->update(['editor_mode' => Workspace::EDITOR_MODE_BLOCK]);

    Artisan::shouldReceive('call')->never();

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.migrate', ['workspace' => $workspace?->id], absolute: false))
        ->assertRedirect()
        ->assertSessionHasErrors('workspace');
});

test('non-owner cannot trigger workspace migration', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $member = User::factory()->create();

    $workspace?->users()->syncWithoutDetaching([
        $member->id => ['role' => 'member'],
    ]);

    Artisan::shouldReceive('call')->never();

    $this
        ->actingAs($member)
        ->post(route('workspaces.settings.migrate', ['workspace' => $workspace?->id], absolute: false))
        ->assertForbidden();
});

test('workspace owner can set active calendar as timeblock sync target in personal workspace', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    Queue::fake([SyncTimeblockUpdateJob::class]);
    config()->set('timeblocks.outbound.dispatch', 'immediate');

    $connection = CalendarConnection::query()->create([
        'workspace_id' => $workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.example.com',
        'username' => 'owner@example.com',
        'password' => 'secret',
    ]);
    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Personal',
        'url' => 'https://caldav.example.com/personal',
        'is_active' => true,
    ]);

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-21',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => ['id' => (string) str()->uuid(), 'blockStyle' => 'bullet'],
                'content' => [['type' => 'text', 'text' => '10:00-11:00 Reconnect link test @ HQ']],
            ]],
        ],
    ]);
    $event = \App\Models\Event::query()
        ->where('note_id', $note->id)
        ->where('eventable_type', \App\Models\Timeblock::class)
        ->firstOrFail();

    $this
        ->actingAs($owner)
        ->patch(route('workspaces.settings.timeblock-sync-target.update', ['workspace' => $workspace->id], absolute: false), [
            'calendar_id' => $calendar->id,
        ])
        ->assertRedirect();

    expect(data_get($owner->fresh()?->settings, 'calendar.outbound_timeblock_calendar_id'))
        ->toBe($calendar->id);
    $link = TimeblockCalendarLink::query()
        ->where('calendar_id', $calendar->id)
        ->where('event_id', $event->id)
        ->first();
    expect($link)->not->toBeNull();
    expect($link?->remote_uid)->toBe("jonril-timeblock-{$event->id}");
    expect($link?->remote_href)->toBe("https://caldav.example.com/personal/jonril-timeblock-{$event->id}.ics");
    expect($link?->sync_status)->toBe(TimeblockCalendarLink::STATUS_PENDING_UPDATE);
    Queue::assertPushed(SyncTimeblockUpdateJob::class);
});

test('workspace settings payload includes timeblock sync stats for selected target calendar', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Personal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/personal',
        'username' => 'owner@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $settings = is_array($owner->settings) ? $owner->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $owner->forceFill(['settings' => $settings])->save();

    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_FAILED,
    ]);
    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) str()->uuid(),
        'event_id' => (string) str()->uuid(),
        'timeblock_id' => (string) str()->uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_UPDATE,
    ]);

    $this
        ->actingAs($owner)
        ->get(route('workspaces.settings.edit', ['workspace' => $workspace->id], absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->where('timeblockSync.selected_calendar_id', $calendar->id)
            ->where('timeblockSync.stats.failed', 1)
            ->where('timeblockSync.stats.pending', 1)
            ->where('timeblockSync.stats.total', 2),
        );
});

test('workspace owner cannot set inactive calendar as timeblock sync target', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Inactive',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/inactive',
        'username' => 'owner@example.com',
        'password' => 'secret',
        'is_active' => false,
    ]);

    $this
        ->actingAs($owner)
        ->patch(route('workspaces.settings.timeblock-sync-target.update', ['workspace' => $workspace->id], absolute: false), [
            'calendar_id' => $calendar->id,
        ])
        ->assertSessionHasErrors('calendar_id');
});

test('workspace owner cannot set timeblock sync target for non personal workspace', function () {
    $owner = User::factory()->create();
    $workspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $owner->id => ['role' => 'owner'],
    ]);

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Shared',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/shared',
        'username' => 'owner@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $this
        ->actingAs($owner)
        ->patch(route('workspaces.settings.timeblock-sync-target.update', ['workspace' => $workspace->id], absolute: false), [
            'calendar_id' => $calendar->id,
        ])
        ->assertStatus(409);
});

test('workspace owner can retry failed timeblock sync for selected target calendar', function () {
    config()->set('timeblocks.outbound.dispatch', 'immediate');
    Queue::fake([SyncTimeblockCreateJob::class]);

    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Personal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/personal',
        'username' => 'owner@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $settings = is_array($owner->settings) ? $owner->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $owner->forceFill(['settings' => $settings])->save();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-21',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => ['id' => (string) str()->uuid(), 'blockStyle' => 'bullet'],
                'content' => [['type' => 'text', 'text' => '10:00-11:00 Sync test @ HQ']],
            ]],
        ],
    ]);

    $event = \App\Models\Event::query()
        ->where('note_id', $note->id)
        ->where('eventable_type', \App\Models\Timeblock::class)
        ->firstOrFail();

    $link = TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => $note->id,
        'event_id' => $event->id,
        'timeblock_id' => (string) $event->eventable_id,
        'sync_status' => TimeblockCalendarLink::STATUS_FAILED,
    ]);

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.timeblock-sync.retry-failed', ['workspace' => $workspace->id], absolute: false))
        ->assertRedirect()
        ->assertSessionHas('status', 'timeblock-sync-retry-dispatched');

    expect($link->fresh()?->sync_status)->toBe(TimeblockCalendarLink::STATUS_PENDING_CREATE);
    Queue::assertPushed(SyncTimeblockCreateJob::class);
});

test('workspace settings payload includes migration summary when migrated block copy exists', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $workspace?->update([
        'editor_mode' => Workspace::EDITOR_MODE_LEGACY,
        'migrated_at' => now(),
    ]);

    $copiedWorkspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'name' => $workspace?->name.' (Block)',
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ]);
    Note::factory()->create([
        'workspace_id' => $copiedWorkspace->id,
        'type' => Note::TYPE_NOTE,
    ]);
    Note::factory()->create([
        'workspace_id' => $copiedWorkspace->id,
        'type' => Note::TYPE_JOURNAL,
    ]);

    $this
        ->actingAs($owner)
        ->get(route('workspaces.settings.edit', ['workspace' => $workspace?->id], absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->where('migrationSummary.workspace.id', $copiedWorkspace->id)
            ->where('migrationSummary.notes.total', 2)
            ->where('migrationSummary.notes.normal', 1)
            ->where('migrationSummary.notes.journal', 1)
        );
});

test('workspace owner can delete workspace when another workspace exists', function () {
    $owner = User::factory()->create();
    $personalWorkspace = $owner->currentWorkspace();

    $collaborationWorkspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'name' => 'Team Workspace',
        'is_personal' => false,
    ]);
    $collaborationWorkspace->users()->syncWithoutDetaching([
        $owner->id => ['role' => 'owner'],
    ]);

    $owner->forceFill([
        'settings' => [
            ...(is_array($owner->settings) ? $owner->settings : []),
            'workspace_id' => $collaborationWorkspace->id,
        ],
    ])->save();

    $this
        ->actingAs($owner)
        ->delete(route('workspaces.settings.destroy', ['workspace' => $collaborationWorkspace->id], absolute: false))
        ->assertRedirect(route('notes.index', ['type' => 'all'], absolute: false))
        ->assertSessionHas('status', 'workspace-deleted');

    expect(Workspace::query()->whereKey($collaborationWorkspace->id)->exists())->toBeFalse();
    expect($owner->fresh()?->currentWorkspace()?->id)->toBe($personalWorkspace?->id);
});

test('workspace owner cannot delete personal workspace', function () {
    $owner = User::factory()->create();
    $personalWorkspace = $owner->currentWorkspace();

    Workspace::factory()->create([
        'owner_id' => $owner->id,
        'is_personal' => false,
    ])->users()->syncWithoutDetaching([
        $owner->id => ['role' => 'owner'],
    ]);

    $this
        ->actingAs($owner)
        ->delete(route('workspaces.settings.destroy', ['workspace' => $personalWorkspace?->id], absolute: false))
        ->assertStatus(409);

    expect(Workspace::query()->whereKey($personalWorkspace?->id)->exists())->toBeTrue();
});

test('workspace owner can clear personal workspace content', function () {
    $owner = User::factory()->create();
    $personalWorkspace = $owner->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $personalWorkspace?->id,
        'type' => Note::TYPE_NOTE,
    ]);
    $journalNote = Note::factory()->create([
        'workspace_id' => $personalWorkspace?->id,
        'type' => Note::TYPE_JOURNAL,
    ]);

    $trashedNote = Note::factory()->create([
        'workspace_id' => $personalWorkspace?->id,
        'type' => Note::TYPE_NOTE,
    ]);
    $trashedNote->delete();

    $otherWorkspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'is_personal' => false,
    ]);
    $otherWorkspace->users()->syncWithoutDetaching([
        $owner->id => ['role' => 'owner'],
    ]);
    $otherWorkspaceNote = Note::factory()->create([
        'workspace_id' => $otherWorkspace->id,
        'type' => Note::TYPE_NOTE,
    ]);
    $calendar = Calendar::query()->create([
        'workspace_id' => $personalWorkspace?->id,
        'name' => 'Primary Calendar',
        'provider' => 'caldav',
        'url' => 'https://calendar.test/personal.ics',
        'username' => 'owner@example.com',
        'password' => 'secret',
    ]);

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.clear', ['workspace' => $personalWorkspace?->id], absolute: false))
        ->assertRedirect()
        ->assertSessionHas('status', 'workspace-cleared');

    expect(Note::query()->withTrashed()->where('workspace_id', $personalWorkspace?->id)->count())->toBe(0);
    expect(Note::query()->whereKey($note->id)->exists())->toBeFalse();
    expect(Note::query()->whereKey($journalNote->id)->exists())->toBeFalse();
    expect(Note::query()->withTrashed()->whereKey($trashedNote->id)->exists())->toBeFalse();
    expect(Calendar::query()->whereKey($calendar->id)->exists())->toBeTrue();

    expect(Note::query()->whereKey($otherWorkspaceNote->id)->exists())->toBeTrue();
});

test('workspace owner can clear personal workspace content including calendars', function () {
    $owner = User::factory()->create();
    $personalWorkspace = $owner->currentWorkspace();

    Note::factory()->create([
        'workspace_id' => $personalWorkspace?->id,
        'type' => Note::TYPE_NOTE,
    ]);
    $calendar = Calendar::query()->create([
        'workspace_id' => $personalWorkspace?->id,
        'name' => 'Primary Calendar',
        'provider' => 'caldav',
        'url' => 'https://calendar.test/personal.ics',
        'username' => 'owner@example.com',
        'password' => 'secret',
    ]);

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.clear', ['workspace' => $personalWorkspace?->id], absolute: false), [
            'include_calendars' => true,
        ])
        ->assertRedirect()
        ->assertSessionHas('status', 'workspace-cleared');

    expect(Note::query()->withTrashed()->where('workspace_id', $personalWorkspace?->id)->count())->toBe(0);
    expect(Calendar::query()->whereKey($calendar->id)->exists())->toBeFalse();
});

test('workspace owner cannot clear non-personal workspace', function () {
    $owner = User::factory()->create();

    $workspace = Workspace::factory()->create([
        'owner_id' => $owner->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $owner->id => ['role' => 'owner'],
    ]);

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
    ]);

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.clear', ['workspace' => $workspace->id], absolute: false))
        ->assertStatus(409);

    expect(Note::query()->whereKey($note->id)->exists())->toBeTrue();
});

test('workspace owner cannot delete last workspace', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();

    $this
        ->actingAs($owner)
        ->delete(route('workspaces.settings.destroy', ['workspace' => $workspace?->id], absolute: false))
        ->assertStatus(409);

    expect(Workspace::query()->whereKey($workspace?->id)->exists())->toBeTrue();
});

test('migrated source workspace cannot be modified via settings endpoints', function () {
    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $workspace?->update([
        'migrated_at' => now(),
    ]);

    $member = User::factory()->create();

    $this
        ->actingAs($owner)
        ->patch(route('workspaces.settings.update', ['workspace' => $workspace?->id], absolute: false), [
            'name' => 'Blocked Update',
        ])
        ->assertStatus(409);

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.members.add', ['workspace' => $workspace?->id], absolute: false), [
            'email' => $member->email,
        ])
        ->assertStatus(409);
});

test('admin can reactivate migrated source workspace', function () {
    $owner = User::factory()->create([
        'role' => 'admin',
    ]);
    $workspace = $owner->currentWorkspace();
    $workspace?->forceFill([
        'migrated_at' => now(),
    ])->save();

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.reactivate', ['workspace' => $workspace?->id], absolute: false))
        ->assertRedirect()
        ->assertSessionHas('status', 'workspace-reactivated');

    expect($workspace?->fresh()?->migrated_at)->toBeNull();
});

test('non-admin cannot reactivate migrated source workspace', function () {
    $owner = User::factory()->create([
        'role' => 'user',
    ]);
    $workspace = $owner->currentWorkspace();
    $workspace?->forceFill([
        'migrated_at' => now(),
    ])->save();

    $this
        ->actingAs($owner)
        ->post(route('workspaces.settings.reactivate', ['workspace' => $workspace?->id], absolute: false))
        ->assertForbidden();

    expect($workspace?->fresh()?->migrated_at)->not->toBeNull();
});
