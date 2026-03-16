<?php

use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;

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

    $this->get('/journal/daily/2026-03-12')
        ->assertInertia(fn (Assert $page) => $page
            ->where('todayEventsDate', '2026-03-12')
            ->has('todayEvents', 1)
            ->where('todayEvents.0.title', 'Midnight planning')
            ->where('todayEvents.0.starts_at', '2026-03-12T00:30:00+01:00')
            ->where('todayEvents.0.ends_at', '2026-03-12T01:00:00+01:00')
            ->where('todayEvents.0.timezone', 'Europe/Amsterdam')
            ->where('todayEvents.0.task_block_id', $blockId),
        );
});

it('keeps sidebar events anchored to the daily journal date for non-journal requests from that page', function (): void {
    $user = User::factory()->create([
        'settings' => [
            'language' => 'nl',
            'timezone' => 'Europe/Amsterdam',
        ],
    ]);
    $workspace = $user->currentWorkspace();

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
                                ['type' => 'text', 'text' => '08:30-09:00 Daily sync'],
                            ],
                        ]],
                    ]],
                ]],
            ],
        ]);

    $this->actingAs($user)
        ->withHeader('referer', '/journal/daily/2026-03-12')
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->where('todayEventsDate', '2026-03-12')
            ->has('todayEvents', 1)
            ->where('todayEvents.0.title', 'Daily sync')
            ->where('todayEvents.0.task_block_id', $blockId),
        );
});
