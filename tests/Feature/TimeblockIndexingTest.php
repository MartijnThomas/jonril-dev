<?php

use App\Jobs\SyncTimeblockCreateJob;
use App\Jobs\SyncTimeblockDeleteJob;
use App\Jobs\SyncTimeblockUpdateJob;
use App\Models\Calendar;
use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

it('indexes daily journal list timeblocks as polymorphic events', function (): void {
    $workspace = Workspace::factory()->create();

    $firstBlockId = (string) str()->uuid();
    $secondBlockId = (string) str()->uuid();

    Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => '2026-03-10',
            'content' => [
                'type' => 'doc',
                'content' => [
                    [
                        'type' => 'bulletList',
                        'content' => [[
                            'type' => 'listItem',
                            'attrs' => ['id' => $firstBlockId],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [
                                    ['type' => 'text', 'text' => '10:00-11:30 Deep work Project Plan'],
                                    ['type' => 'text', 'text' => ' @ Office'],
                                ],
                            ]],
                        ]],
                    ],
                    [
                        'type' => 'taskList',
                        'content' => [[
                            'type' => 'taskItem',
                            'attrs' => [
                                'id' => $secondBlockId,
                                'checked' => true,
                                'taskStatus' => 'done',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [
                                    ['type' => 'text', 'text' => '13:00 Review inbox'],
                                ],
                            ]],
                        ]],
                    ],
                ],
            ],
        ]);

    $events = Event::query()
        ->where('eventable_type', Timeblock::class)
        ->orderBy('starts_at')
        ->get();

    expect($events)->toHaveCount(2);

    $firstEvent = $events->first();
    $secondEvent = $events->last();

    expect($firstEvent?->title)->toBe('Deep work Project Plan');
    expect($firstEvent?->starts_at?->format('Y-m-d H:i:s'))->toBe('2026-03-10 10:00:00');
    expect($firstEvent?->ends_at?->format('Y-m-d H:i:s'))->toBe('2026-03-10 11:30:00');

    expect($secondEvent?->title)->toBe('Review inbox');
    expect($secondEvent?->starts_at?->format('Y-m-d H:i:s'))->toBe('2026-03-10 13:00:00');
    expect($secondEvent?->ends_at?->format('Y-m-d H:i:s'))->toBe('2026-03-10 14:00:00');

    $firstTimeblock = Timeblock::query()->findOrFail($firstEvent?->eventable_id);
    $secondTimeblock = Timeblock::query()->findOrFail($secondEvent?->eventable_id);

    expect($firstTimeblock->location)->toBe('Office')
        ->and($firstTimeblock->task_block_id)->toBeNull();

    expect($secondTimeblock->task_block_id)->toBe($secondBlockId)
        ->and($secondTimeblock->task_checked)->toBeTrue()
        ->and($secondTimeblock->task_status)->toBe('done');
});

it('does not index timeblocks for non-daily notes', function (): void {
    $workspace = Workspace::factory()->create();

    Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_WEEKLY,
            'journal_date' => '2026-03-09',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'taskList',
                    'content' => [[
                        'type' => 'taskItem',
                        'attrs' => ['id' => (string) str()->uuid()],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [
                                ['type' => 'text', 'text' => '09:00 Weekly planning'],
                            ],
                        ]],
                    ]],
                ]],
            ],
        ]);

    expect(Event::query()->count())->toBe(0)
        ->and(Timeblock::query()->count())->toBe(0);
});

it('anchors daily timeblocks to journal_date while storing utc times for user timezone', function (): void {
    $user = User::factory()->create([
        'settings' => [
            'language' => 'nl',
            'timezone' => 'Europe/Amsterdam',
        ],
    ]);
    $workspace = $user->currentWorkspace();

    $blockId = (string) str()->uuid();

    $this->actingAs($user);

    $note = Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => '2026-03-12',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'taskList',
                    'content' => [[
                        'type' => 'taskItem',
                        'attrs' => [
                            'id' => $blockId,
                            'checked' => false,
                        ],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [
                                ['type' => 'text', 'text' => '00:30-01:00 Midnight planning'],
                            ],
                        ]],
                    ]],
                ]],
            ],
        ]);

    $event = Event::query()
        ->where('eventable_type', Timeblock::class)
        ->where('note_id', $note->id)
        ->firstOrFail();

    expect($event->journal_date?->toDateString())->toBe('2026-03-12')
        ->and($event->timezone)->toBe('Europe/Amsterdam')
        ->and($event->starts_at?->format('Y-m-d H:i:s'))->toBe('2026-03-11 23:30:00')
        ->and($event->ends_at?->format('Y-m-d H:i:s'))->toBe('2026-03-12 00:00:00');
});

it('keeps event and timeblock ids stable when a timeblock is edited', function (): void {
    $workspace = Workspace::factory()->create();
    $blockId = (string) str()->uuid();

    $note = Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => '2026-03-12',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                    'content' => [
                        ['type' => 'text', 'text' => '10:00-11:00 Planning @ Office'],
                    ],
                ]],
            ],
        ]);

    $originalEvent = Event::query()
        ->where('eventable_type', Timeblock::class)
        ->where('note_id', $note->id)
        ->where('block_id', $blockId)
        ->firstOrFail();
    $originalTimeblockId = (string) $originalEvent->eventable_id;

    $note->update([
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                'content' => [
                    ['type' => 'text', 'text' => '10:00-11:00 Planning refined @ HQ'],
                ],
            ]],
        ],
    ]);

    $updatedEvent = Event::query()
        ->where('eventable_type', Timeblock::class)
        ->where('note_id', $note->id)
        ->where('block_id', $blockId)
        ->firstOrFail();
    $updatedTimeblock = Timeblock::query()->findOrFail($updatedEvent->eventable_id);

    expect((string) $updatedEvent->id)->toBe((string) $originalEvent->id)
        ->and((string) $updatedEvent->eventable_id)->toBe($originalTimeblockId)
        ->and($updatedEvent->title)->toBe('Planning refined')
        ->and($updatedTimeblock->location)->toBe('HQ');
});

it('does not create duplicate events for repeated saves of the same timeblock block id', function (): void {
    $workspace = Workspace::factory()->create();
    $blockId = (string) str()->uuid();

    $note = Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => '2026-03-12',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                    'content' => [
                        ['type' => 'text', 'text' => '10:00-11:00 Planning @ Office'],
                    ],
                ]],
            ],
        ]);

    $note->update([
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                'content' => [
                    ['type' => 'text', 'text' => '10:00-11:00 Planning @ Office'],
                ],
            ]],
        ],
    ]);

    $note->update([
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                'content' => [
                    ['type' => 'text', 'text' => '10:00-11:00 Planning changed @ Office'],
                ],
            ]],
        ],
    ]);

    expect(
        Event::query()
            ->where('eventable_type', Timeblock::class)
            ->where('note_id', $note->id)
            ->where('block_id', $blockId)
            ->count()
    )->toBe(1);
});

it('queues outbound calendar intents for create update and delete when a target calendar is selected', function (): void {
    config()->set('timeblocks.outbound.dispatch', 'scheduled');

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Primary',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/user/primary/',
        'username' => 'user@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $user->forceFill([
        'settings' => array_merge(
            is_array($user->settings) ? $user->settings : [],
            ['calendar' => ['outbound_timeblock_calendar_id' => $calendar->id]],
        ),
    ])->save();

    $this->actingAs($user);

    $blockId = (string) str()->uuid();

    $note = Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => '2026-03-12',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                    'content' => [
                        ['type' => 'text', 'text' => '10:00-11:00 Planning @ Office'],
                    ],
                ]],
            ],
        ]);

    $event = Event::query()
        ->where('eventable_type', Timeblock::class)
        ->where('note_id', $note->id)
        ->where('block_id', $blockId)
        ->firstOrFail();

    $link = TimeblockCalendarLink::query()
        ->where('event_id', $event->id)
        ->where('calendar_id', $calendar->id)
        ->firstOrFail();

    expect($link->sync_status)->toBe(TimeblockCalendarLink::STATUS_PENDING_CREATE);

    $link->update([
        'sync_status' => TimeblockCalendarLink::STATUS_SYNCED,
        'remote_uid' => 'uid-1',
    ]);

    $note->update([
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                'content' => [
                    ['type' => 'text', 'text' => '10:00-11:00 Planning refined @ HQ'],
                ],
            ]],
        ],
    ]);

    $link->refresh();
    expect($link->sync_status)->toBe(TimeblockCalendarLink::STATUS_PENDING_UPDATE);

    $link->update([
        'sync_status' => TimeblockCalendarLink::STATUS_SYNCED,
    ]);

    $note->update([
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $link->refresh();
    expect($link->sync_status)->toBe(TimeblockCalendarLink::STATUS_PENDING_DELETE);
});

it('dispatches outbound sync jobs immediately when dispatch policy is immediate', function (): void {
    config()->set('timeblocks.outbound.dispatch', 'immediate');
    Queue::fake([SyncTimeblockCreateJob::class]);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Primary',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/user/primary/',
        'username' => 'user@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $settings = is_array($user->settings) ? $user->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $user->forceFill(['settings' => $settings])->save();

    $this->actingAs($user);

    $blockId = (string) str()->uuid();

    Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => '2026-03-12',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                    'content' => [
                        ['type' => 'text', 'text' => '10:00-11:00 Planning @ Office'],
                    ],
                ]],
            ],
        ]);

    Queue::assertPushed(SyncTimeblockCreateJob::class);
});

it('does not dispatch outbound sync jobs immediately when dispatch policy is scheduled', function (): void {
    config()->set('timeblocks.outbound.dispatch', 'scheduled');
    Queue::fake([
        SyncTimeblockCreateJob::class,
        SyncTimeblockUpdateJob::class,
        SyncTimeblockDeleteJob::class,
    ]);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Primary',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.test/user/primary/',
        'username' => 'user@example.test',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $settings = is_array($user->settings) ? $user->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $user->forceFill(['settings' => $settings])->save();

    $this->actingAs($user);

    $blockId = (string) str()->uuid();

    Note::factory()
        ->for($workspace)
        ->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => '2026-03-12',
            'content' => [
                'type' => 'doc',
                'content' => [[
                    'type' => 'paragraph',
                    'attrs' => ['id' => $blockId, 'blockStyle' => 'bullet'],
                    'content' => [
                        ['type' => 'text', 'text' => '10:00-11:00 Planning @ Office'],
                    ],
                ]],
            ],
        ]);

    Queue::assertNotPushed(SyncTimeblockCreateJob::class);
    Queue::assertNotPushed(SyncTimeblockUpdateJob::class);
    Queue::assertNotPushed(SyncTimeblockDeleteJob::class);
});
