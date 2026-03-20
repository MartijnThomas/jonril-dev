<?php

use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\CalendarSyncedRange;
use App\Models\Event;
use App\Models\LegacyNote;
use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteRevision;
use App\Models\NoteTask;
use App\Models\Timeblock;
use App\Models\User;
use App\Models\Workspace;

test('clear workspace command dry run shows summary without deleting', function () {
    $workspace = Workspace::factory()->create();
    $otherWorkspace = Workspace::factory()->create();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
    ]);

    $otherNote = Note::factory()->create([
        'workspace_id' => $otherWorkspace->id,
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'note_title' => $note->title,
        'position' => 1,
        'checked' => false,
        'content_text' => 'Task to keep in dry run',
    ]);

    NoteHeading::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => 'h_1',
        'level' => 1,
        'text' => 'Heading',
    ]);

    LegacyNote::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'legacy_note_id' => 101,
        'legacy_team_id' => 1,
        'legacy_slug' => 'Projects/Alpha/Plan',
        'legacy_note_payload' => ['slug' => 'Projects/Alpha/Plan'],
    ]);

    $user = User::factory()->create();
    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => $note->title,
        'content' => data_get($note->content, 'content', []),
        'properties' => [],
    ]);

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Team Calendar',
        'provider' => 'caldav',
        'url' => 'https://calendar.test/team.ics',
        'username' => 'owner@example.com',
        'password' => 'secret',
    ]);
    CalendarSyncedRange::query()->create([
        'calendar_id' => $calendar->id,
        'period' => '2026-03',
        'synced_at' => now(),
    ]);
    $calendarItem = CalendarItem::query()->create([
        'calendar_id' => $calendar->id,
        'uid' => 'dry-run-uid',
    ]);
    $timeblock = Timeblock::query()->create([
        'location' => 'Desk',
    ]);
    Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $timeblock->id,
        'title' => 'Focus block',
        'starts_at' => now(),
        'ends_at' => now()->addHour(),
        'timezone' => 'UTC',
    ]);
    Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => CalendarItem::class,
        'eventable_id' => $calendarItem->id,
        'title' => 'Calendar event',
        'starts_at' => now(),
        'ends_at' => now()->addHour(),
        'timezone' => 'UTC',
    ]);

    $this->artisan('notes:clear-workspace', [
        '--workspace' => $workspace->id,
        '--dry-run' => true,
    ])
        ->expectsOutputToContain('WORKSPACE CLEAR CONTEXT')
        ->expectsOutputToContain('Run mode')
        ->expectsOutputToContain('Dry run complete')
        ->assertExitCode(0);

    expect(Note::query()->withTrashed()->where('workspace_id', $workspace->id)->count())->toBe(1);
    expect(NoteTask::query()->where('workspace_id', $workspace->id)->count())->toBe(1);
    expect(NoteHeading::query()->where('workspace_id', $workspace->id)->count())->toBe(1);
    expect(LegacyNote::query()->where('workspace_id', $workspace->id)->count())->toBe(1);
    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(1);
    expect(Event::query()->where('workspace_id', $workspace->id)->count())->toBe(2);
    expect(Timeblock::query()->whereKey($timeblock->id)->exists())->toBeTrue();
    expect(CalendarItem::query()->whereKey($calendarItem->id)->exists())->toBeTrue();
    expect(CalendarSyncedRange::query()->where('calendar_id', $calendar->id)->count())->toBe(1);

    expect(Note::query()->withTrashed()->where('workspace_id', $otherWorkspace->id)->count())->toBe(1);
    expect($otherNote->id)->not->toBe($note->id);
});

test('clear workspace command removes workspace notes and legacy rows on live run', function () {
    $workspace = Workspace::factory()->create();
    $otherWorkspace = Workspace::factory()->create();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
    ]);

    $trashedNote = Note::factory()->create([
        'workspace_id' => $workspace->id,
    ]);
    $trashedNote->delete();

    $otherNote = Note::factory()->create([
        'workspace_id' => $otherWorkspace->id,
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'note_title' => $note->title,
        'position' => 1,
        'checked' => false,
        'content_text' => 'Task to clear',
    ]);

    NoteHeading::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => 'h_1',
        'level' => 1,
        'text' => 'Heading',
    ]);

    LegacyNote::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'legacy_note_id' => 101,
        'legacy_team_id' => 1,
        'legacy_slug' => 'Projects/Alpha/Plan',
        'legacy_note_payload' => ['slug' => 'Projects/Alpha/Plan'],
    ]);

    $user = User::factory()->create();
    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => $note->title,
        'content' => data_get($note->content, 'content', []),
        'properties' => [],
    ]);
    NoteRevision::query()->create([
        'note_id' => $trashedNote->id,
        'user_id' => $user->id,
        'title' => $trashedNote->title,
        'content' => data_get($trashedNote->content, 'content', []),
        'properties' => [],
    ]);

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Team Calendar',
        'provider' => 'caldav',
        'url' => 'https://calendar.test/team.ics',
        'username' => 'owner@example.com',
        'password' => 'secret',
    ]);
    CalendarSyncedRange::query()->create([
        'calendar_id' => $calendar->id,
        'period' => '2026-03',
        'synced_at' => now(),
    ]);
    $calendarItem = CalendarItem::query()->create([
        'calendar_id' => $calendar->id,
        'uid' => 'live-run-uid',
    ]);
    $timeblock = Timeblock::query()->create([
        'location' => 'Room 1',
    ]);
    Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $timeblock->id,
        'title' => 'Timeblock event',
        'starts_at' => now(),
        'ends_at' => now()->addHour(),
        'timezone' => 'UTC',
    ]);
    Event::query()->create([
        'workspace_id' => $workspace->id,
        'eventable_type' => CalendarItem::class,
        'eventable_id' => $calendarItem->id,
        'title' => 'Calendar event',
        'starts_at' => now(),
        'ends_at' => now()->addHour(),
        'timezone' => 'UTC',
    ]);

    $otherCalendar = Calendar::query()->create([
        'workspace_id' => $otherWorkspace->id,
        'name' => 'Other Calendar',
        'provider' => 'caldav',
        'url' => 'https://calendar.test/other.ics',
        'username' => 'other@example.com',
        'password' => 'secret',
    ]);
    $otherCalendarItem = CalendarItem::query()->create([
        'calendar_id' => $otherCalendar->id,
        'uid' => 'other-uid',
    ]);
    Event::query()->create([
        'workspace_id' => $otherWorkspace->id,
        'eventable_type' => CalendarItem::class,
        'eventable_id' => $otherCalendarItem->id,
        'title' => 'Other workspace event',
        'starts_at' => now(),
        'ends_at' => now()->addHour(),
        'timezone' => 'UTC',
    ]);

    $this->artisan('notes:clear-workspace', [
        '--workspace' => $workspace->id,
        '--force' => true,
    ])
        ->expectsOutputToContain('WORKSPACE CLEAR CONTEXT')
        ->expectsOutputToContain('Workspace clear complete')
        ->assertExitCode(0);

    expect(Note::query()->withTrashed()->where('workspace_id', $workspace->id)->count())->toBe(0);
    expect(NoteTask::query()->where('workspace_id', $workspace->id)->count())->toBe(0);
    expect(NoteHeading::query()->where('workspace_id', $workspace->id)->count())->toBe(0);
    expect(LegacyNote::query()->where('workspace_id', $workspace->id)->count())->toBe(0);
    expect(NoteRevision::query()->whereIn('note_id', [$note->id, $trashedNote->id])->count())->toBe(0);
    expect(Event::query()->where('workspace_id', $workspace->id)->count())->toBe(0);
    expect(Timeblock::query()->whereKey($timeblock->id)->exists())->toBeFalse();
    expect(CalendarItem::query()->whereKey($calendarItem->id)->exists())->toBeFalse();
    expect(CalendarSyncedRange::query()->where('calendar_id', $calendar->id)->count())->toBe(0);

    expect(Note::query()->withTrashed()->where('workspace_id', $otherWorkspace->id)->count())->toBe(1);
    expect(Note::query()->where('id', $otherNote->id)->exists())->toBeTrue();
    expect(Event::query()->where('workspace_id', $otherWorkspace->id)->count())->toBe(1);
    expect(CalendarItem::query()->whereKey($otherCalendarItem->id)->exists())->toBeTrue();
});
