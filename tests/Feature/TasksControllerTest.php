<?php

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

test('tasks index redirects to notes list for migrated source workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'migrated_at' => now(),
    ])->save();

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertRedirect(route('notes.index', ['type' => 'all'], absolute: false));
});

test('tasks cannot be toggled by reference in migrated source workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'migrated_at' => now(),
    ])->save();

    $note = Note::factory()->create([
        'workspace_id' => $workspace?->id,
        'type' => Note::TYPE_NOTE,
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Blocked task toggle']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch(route('tasks.checked-by-reference', absolute: false), [
            'note_id' => $note->id,
            'position' => 1,
            'checked' => true,
        ])
        ->assertStatus(409);
});

test('tasks index extracts tasks and hides completed items by default', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project Notes',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-10',
                                'deadlineDate' => '2026-03-12',
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => '! Call '],
                                        [
                                            'type' => 'mention',
                                            'attrs' => [
                                                'id' => 'Lea',
                                                'label' => 'Lea',
                                                'mentionSuggestionChar' => '@',
                                            ],
                                        ],
                                        ['type' => 'text', 'text' => ' about '],
                                        [
                                            'type' => 'hashtag',
                                            'attrs' => [
                                                'id' => 'work',
                                                'label' => 'work',
                                                'mentionSuggestionChar' => '#',
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => true,
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => 'Completed item'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->has('tasks.data', 1)
            ->where('tasks.data.0.note.id', $note->id)
            ->where('tasks.data.0.checked', false)
            ->where('tasks.data.0.due_date', '2026-03-10')
            ->where('tasks.data.0.deadline_date', '2026-03-12')
            ->where('tasks.data.0.task_status', null)
            ->where('tasks.data.0.priority', 'normal')
            ->where('tasks.data.0.mentions.0', 'Lea')
            ->where('tasks.data.0.hashtags.0', 'work')
            ->where('tasks.data.0.render_fragments.0.type', 'priority_token')
            ->where('tasks.data.0.render_fragments.0.priority', 'normal')
            ->where('filters.show_completed', false),
        );
});

test('open status filter shows only null-status tasks excluding assigned in_progress starred backlog', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $noteContent = fn (string $status, string $text) => [
        'type' => 'taskItem',
        'attrs' => ['checked' => false, 'taskStatus' => $status],
        'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => $text]]]],
    ];

    $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Status test',
        'workspace_id' => $workspace->id,
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [
                    [
                        'type' => 'taskItem',
                        'attrs' => ['checked' => false],
                        'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Open task']]]],
                    ],
                    $noteContent('assigned', 'Assigned task'),
                    $noteContent('in_progress', 'In progress task'),
                    $noteContent('starred', 'Starred task'),
                    $noteContent('backlog', 'Backlog task'),
                    $noteContent('canceled', 'Canceled task'),
                    $noteContent('migrated', 'Migrated task'),
                    [
                        'type' => 'taskItem',
                        'attrs' => ['checked' => true],
                        'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Completed task']]]],
                    ],
                ],
            ]],
        ],
    ]);

    // Default view (status=open) shows only null-status tasks.
    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->has('tasks.data', 1)
            ->where('tasks.data.0.task_status', null)
            ->where('tasks.data.0.content', 'Open task'),
        );

    // Each non-open status is individually filterable.
    foreach (['assigned', 'in_progress', 'starred', 'backlog'] as $status) {
        $this
            ->actingAs($user)
            ->get("/tasks?status[]={$status}")
            ->assertInertia(fn (Assert $page) => $page
                ->has('tasks.data', 1)
                ->where('tasks.data.0.task_status', $status),
            );
    }
});

test('tasks index excludes tasks from workspaces marked as migrated source', function () {
    $user = User::factory()->create();
    $primaryWorkspace = $user->currentWorkspace();

    $secondaryWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'name' => 'Secondary Active',
    ]);

    $user->workspaces()->syncWithoutDetaching([
        $secondaryWorkspace->id => ['role' => 'owner'],
    ]);
    $user->forceFill([
        'settings' => [
            ...(is_array($user->settings) ? $user->settings : []),
            'workspace_id' => $secondaryWorkspace->id,
        ],
    ])->save();

    $primaryWorkspace?->forceFill([
        'migrated_at' => now(),
    ])->save();

    $primaryNote = Note::factory()->create([
        'workspace_id' => $primaryWorkspace?->id,
        'title' => 'Primary note',
        'slug' => 'primary-note',
    ]);

    $secondaryNote = Note::factory()->create([
        'workspace_id' => $secondaryWorkspace->id,
        'title' => 'Secondary note',
        'slug' => 'secondary-note',
    ]);

    NoteTask::query()->create([
        'workspace_id' => $primaryWorkspace?->id,
        'note_id' => $primaryNote->id,
        'block_id' => 'task-primary',
        'position' => 1,
        'checked' => false,
        'content_text' => 'Primary task should be excluded',
        'mentions' => [],
        'hashtags' => [],
    ]);

    NoteTask::query()->create([
        'workspace_id' => $secondaryWorkspace->id,
        'note_id' => $secondaryNote->id,
        'block_id' => 'task-secondary',
        'position' => 1,
        'checked' => false,
        'content_text' => 'Secondary task should stay visible',
        'mentions' => [],
        'hashtags' => [],
    ]);

    $this->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->where('workspaces.0.id', $secondaryWorkspace->id)
            ->where('tasks.data.0.content', 'Secondary task should stay visible')
            ->where('tasks.total', 1),
        );
});

test('tasks index can include completed tasks and filter by hashtag', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => true,
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => 'Ship release '],
                                        [
                                            'type' => 'hashtag',
                                            'attrs' => [
                                                'id' => 'launch',
                                                'label' => 'launch',
                                                'mentionSuggestionChar' => '#',
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks?show_completed=1&hashtag=launch')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->has('tasks.data', 1)
            ->where('tasks.data.0.checked', true)
            ->where('tasks.data.0.note.id', $note->id)
            ->where('tasks.data.0.hashtags.0', 'launch')
            ->where('filters.show_completed', true)
            ->where('filters.hashtag', 'launch'),
        );
});

test('tasks index exposes completed and canceled metadata timestamps', function () {
    $user = User::factory()->create();

    $completedAt = '2026-03-10T09:15:00+00:00';
    $canceledAt = '2026-03-10T10:45:00+00:00';
    $startedAt = '2026-03-10T08:30:00+00:00';

    $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Task metadata note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [
                    [
                        'type' => 'taskItem',
                        'attrs' => [
                            'checked' => true,
                            'dueDate' => '2026-03-10',
                            'completedAt' => $completedAt,
                        ],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [['type' => 'text', 'text' => 'Completed task']],
                        ]],
                    ],
                    [
                        'type' => 'taskItem',
                        'attrs' => [
                            'checked' => false,
                            'taskStatus' => 'canceled',
                            'dueDate' => '2026-03-11',
                            'canceledAt' => $canceledAt,
                        ],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [['type' => 'text', 'text' => 'Canceled task']],
                        ]],
                    ],
                    [
                        'type' => 'taskItem',
                        'attrs' => [
                            'checked' => false,
                            'taskStatus' => 'in_progress',
                            'dueDate' => '2026-03-12',
                            'startedAt' => $startedAt,
                        ],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [['type' => 'text', 'text' => 'In progress task']],
                        ]],
                    ],
                ],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks?show_completed=1&status[]=completed&status[]=canceled&status[]=in_progress')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->has('tasks.data', 3)
            ->where('tasks.data.0.checked', true)
            ->where('tasks.data.0.completed_at', $completedAt)
            ->where('tasks.data.0.canceled_at', null)
            ->where('tasks.data.0.started_at', null)
            ->where('tasks.data.1.task_status', 'canceled')
            ->where('tasks.data.1.checked', false)
            ->where('tasks.data.1.canceled_at', $canceledAt)
            ->where('tasks.data.1.completed_at', null)
            ->where('tasks.data.1.started_at', null)
            ->where('tasks.data.2.task_status', 'in_progress')
            ->where('tasks.data.2.checked', false)
            ->where('tasks.data.2.started_at', $startedAt)
            ->where('tasks.data.2.completed_at', null)
            ->where('tasks.data.2.canceled_at', null),
        );
});

test('tasks index exposes render fragments for mentions hashtags and wikilinks', function () {
    $user = User::factory()->create();

    $linkedNote = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Linked target',
    ]);

    $taskNote = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Rich task note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-07',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [
                                    ['type' => 'text', 'text' => 'See '],
                                    [
                                        'type' => 'text',
                                        'text' => 'Project 1',
                                        'marks' => [[
                                            'type' => 'wikiLink',
                                            'attrs' => [
                                                'noteId' => $linkedNote->id,
                                                'href' => "/notes/{$linkedNote->id}",
                                            ],
                                        ]],
                                    ],
                                    ['type' => 'text', 'text' => ' with '],
                                    [
                                        'type' => 'mention',
                                        'attrs' => [
                                            'id' => 'Lea',
                                            'label' => 'Lea',
                                            'mentionSuggestionChar' => '@',
                                        ],
                                    ],
                                    ['type' => 'text', 'text' => ' and '],
                                    [
                                        'type' => 'hashtag',
                                        'attrs' => [
                                            'id' => 'work',
                                            'label' => 'work',
                                            'mentionSuggestionChar' => '#',
                                        ],
                                    ],
                                ],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->has('tasks.data', 1)
            ->where('tasks.data.0.note.id', $taskNote->id)
            ->where('tasks.data.0.render_fragments.0.type', 'text')
            ->where('tasks.data.0.render_fragments.1.type', 'wikilink')
            ->where('tasks.data.0.render_fragments.1.text', 'Project 1')
            ->where('tasks.data.0.render_fragments.1.note_id', $linkedNote->id)
            ->where('tasks.data.0.render_fragments.1.href', "/notes/{$linkedNote->id}")
            ->where('tasks.data.0.render_fragments.3.type', 'mention')
            ->where('tasks.data.0.render_fragments.3.label', 'Lea')
            ->where('tasks.data.0.render_fragments.5.type', 'hashtag')
            ->where('tasks.data.0.render_fragments.5.label', 'work'),
        );
});

test('tasks index exposes in-place due and deadline token fragments', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Date token note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [
                                    ['type' => 'text', 'text' => 'Task >2026-03-08 and >>2026-03-09'],
                                ],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->has('tasks.data', 1)
            ->where('tasks.data.0.note.id', $note->id)
            ->where('tasks.data.0.render_fragments.0.type', 'text')
            ->where('tasks.data.0.render_fragments.1.type', 'due_date_token')
            ->where('tasks.data.0.render_fragments.1.date', '2026-03-08')
            ->where('tasks.data.0.render_fragments.3.type', 'deadline_date_token')
            ->where('tasks.data.0.render_fragments.3.date', '2026-03-09'),
        );
});

test('tasks index date range filter matches due deadline or journal_date', function () {
    $user = User::factory()->create();

    $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Date filter note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-10',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Due in range']],
                            ]],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'deadlineDate' => '2026-03-12',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Deadline in range']],
                            ]],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-04-01',
                                'deadlineDate' => '2026-04-02',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Outside range']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $user->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-11',
        'title' => 'Woensdag 11 maart 2026',
        'slug' => 'journal/daily/2026-03-11',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Journal in range']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $user->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-04-10',
        'title' => 'Vrijdag 10 april 2026',
        'slug' => 'journal/daily/2026-04-10',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Journal outside range']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks?date_from=2026-03-09&date_to=2026-03-15')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.date_from', '2026-03-09')
            ->where('filters.date_to', '2026-03-15')
            ->has('tasks.data', 3),
        );
});

test('tasks index single day date filter includes tasks due or deadline on that day', function () {
    $user = User::factory()->create();

    $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Today filter note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-07',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Due today']],
                            ]],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'deadlineDate' => '2026-03-07',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Deadline today']],
                            ]],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-08',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Tomorrow task']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks?date_from=2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.date_from', '2026-03-07')
            ->has('tasks.data', 2),
        );
});

test('tasks index supports date preset filters from url', function () {
    Carbon::setTestNow('2026-03-10 10:00:00');

    $user = User::factory()->create();

    $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Preset date filter note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-10',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Today task']],
                            ]],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'deadlineDate' => '2026-03-17',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'In 7 days task']],
                            ]],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-18',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Outside preset task']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks?date_preset=today_plus_7')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.date_preset', 'today_plus_7')
            ->where('filters.date_from', '2026-03-10')
            ->where('filters.date_to', '2026-03-17')
            ->has('tasks.data', 2),
        );

    Carbon::setTestNow();
});

test('tasks index exposes journal_date for tasks in daily journal notes', function () {
    $user = User::factory()->create();

    $dailyNote = $user->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-10',
        'title' => 'Dinsdag 10 maart 2026',
        'slug' => 'journal/daily/2026-03-10',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => ['checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Daily journal task']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('tasks.data.0.note.id', $dailyNote->id)
            ->where('tasks.data.0.journal_date', '2026-03-10')
            ->where('tasks.data.0.due_date', null)
            ->where('tasks.data.0.deadline_date', null),
        );
});

test('note model events keep task index in sync', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Event indexed note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => ['checked' => false],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => 'Initial task'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->has('tasks.data', 1)
            ->where('tasks.data.0.content', 'Initial task'),
        );

    $note->content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'taskList',
                'content' => [
                    [
                        'type' => 'taskItem',
                        'attrs' => ['checked' => false],
                        'content' => [
                            [
                                'type' => 'paragraph',
                                'content' => [
                                    ['type' => 'text', 'text' => 'Updated task'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ];
    $note->save();

    $this
        ->actingAs($user)
        ->get('/tasks?q=Updated')
        ->assertInertia(fn (Assert $page) => $page
            ->has('tasks.data', 1)
            ->where('tasks.data.0.content', 'Updated task'),
        );

    $note->delete();

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->has('tasks.data', 0),
        );
});

test('tasks index defaults to current workspace and can filter by workspace', function () {
    $user = User::factory()->create();
    $primaryWorkspace = $user->currentWorkspace();

    $secondaryWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'name' => 'Client Team',
    ]);
    $user->workspaces()->syncWithoutDetaching([
        $secondaryWorkspace->id => ['role' => 'owner'],
    ]);

    $primaryNote = Note::query()->create([
        'workspace_id' => $primaryWorkspace?->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Primary task note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => ['checked' => false],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Primary workspace task']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $secondaryNote = Note::query()->create([
        'workspace_id' => $secondaryWorkspace->id,
        'type' => Note::TYPE_NOTE,
        'title' => 'Secondary task note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => ['checked' => false],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Secondary workspace task']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->has('workspaces', 2)
            ->where('filters.workspace_ids', [$primaryWorkspace?->id])
            ->has('tasks.data', 1)
            ->where('tasks.data.0.note.id', $primaryNote->id)
            ->where('tasks.data.0.content', 'Primary workspace task'),
        );

    $this
        ->actingAs($user)
        ->get('/tasks?workspace_ids[]='.$secondaryWorkspace->id)
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.workspace_ids', [$secondaryWorkspace->id])
            ->has('tasks.data', 1)
            ->where('tasks.data.0.note.id', $secondaryNote->id)
            ->where('tasks.data.0.content', 'Secondary workspace task'),
        );
});

test('tasks index note tree filter matches selected note and its direct children', function () {
    $user = User::factory()->create();

    $parent = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Parent',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => ['checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Parent task']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'parent_id' => $parent->id,
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => ['checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Child task']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Other',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => ['checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Other task']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/tasks?note_scope_ids[]='.$parent->id)
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.note_scope_ids', [$parent->id])
            ->has('tasks.data', 2),
        );
});

test('task checkbox update persists in note json and task index', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Toggle note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'id' => 'task-block-1',
                                'checked' => false,
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Toggle me']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $task = NoteTask::query()->where('note_id', $note->id)->firstOrFail();
    expect($task)->not->toBeNull();
    expect($task->checked)->toBeFalse();

    $this
        ->actingAs($user)
        ->patch("/tasks/{$task->id}/checked", [
            'checked' => true,
        ])
        ->assertRedirect();

    $note->refresh();
    $reindexedTask = NoteTask::query()->where('note_id', $note->id)->first();

    expect(data_get($note->content, 'content.0.content.0.attrs.checked'))->toBeTrue();
    expect((string) data_get($note->content, 'content.0.content.0.attrs.completedAt'))->not->toBe('');
    expect($reindexedTask?->checked)->toBeTrue();
    expect($reindexedTask?->completed_at)->not->toBeNull();
});

test('task checkbox can be toggled and undone via stable task reference', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Toggle undo note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'id' => 'task-block-undo-1',
                                'checked' => false,
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => 'Undo me']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch('/tasks/checked', [
            'note_id' => $note->id,
            'block_id' => 'task-block-undo-1',
            'position' => 1,
            'checked' => true,
        ])
        ->assertRedirect();

    $note->refresh();
    expect(data_get($note->content, 'content.0.content.0.attrs.checked'))->toBeTrue();
    expect((string) data_get($note->content, 'content.0.content.0.attrs.completedAt'))->not->toBe('');

    $this
        ->actingAs($user)
        ->patch('/tasks/checked', [
            'note_id' => $note->id,
            'block_id' => 'task-block-undo-1',
            'position' => 1,
            'checked' => false,
        ])
        ->assertRedirect();

    $note->refresh();
    $reindexedTask = NoteTask::query()
        ->where('note_id', $note->id)
        ->where('block_id', 'task-block-undo-1')
        ->first();

    expect(data_get($note->content, 'content.0.content.0.attrs.checked'))->toBeFalse();
    expect(data_get($note->content, 'content.0.content.0.attrs.completedAt'))->toBeNull();
    expect($reindexedTask)->not->toBeNull();
    expect($reindexedTask?->checked)->toBeFalse();
    expect($reindexedTask?->completed_at)->toBeNull();
});

test('backlog task promotion clears backlog status and stores promotion timestamp', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Backlog promotion note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'id' => 'task-backlog-promote-1',
                                'checked' => false,
                                'taskStatus' => 'backlog',
                            ],
                            'content' => [[
                                'type' => 'paragraph',
                                'content' => [['type' => 'text', 'text' => '? Review scope']],
                            ]],
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch('/tasks/checked', [
            'note_id' => $note->id,
            'block_id' => 'task-backlog-promote-1',
            'position' => 1,
            'checked' => true,
            'promote_backlog' => true,
        ])
        ->assertRedirect();

    $note->refresh();
    $attrs = data_get($note->content, 'content.0.content.0.attrs', []);
    $reindexedTask = NoteTask::query()
        ->where('note_id', $note->id)
        ->where('block_id', 'task-backlog-promote-1')
        ->first();

    expect(data_get($attrs, 'checked'))->toBeFalse();
    expect(data_get($attrs, 'taskStatus'))->toBeNull();
    expect((string) data_get($attrs, 'backlogPromotedAt'))->not->toBe('');
    expect((string) data_get($note->content, 'content.0.content.0.content.0.content.0.text'))->toBe('Review scope');
    expect($reindexedTask)->not->toBeNull();
    expect($reindexedTask?->checked)->toBeFalse();
    expect($reindexedTask?->task_status)->toBeNull();
    expect($reindexedTask?->backlog_promoted_at)->not->toBeNull();
});

test('migrate targets endpoint returns journal presets and workspace notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $source = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source note',
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Client follow-up',
    ]);

    $response = $this
        ->actingAs($user)
        ->getJson('/tasks/migrate-targets?source_note_id='.$source->id.'&q=');

    $response
        ->assertOk()
        ->assertJsonStructure([
            'items' => [[
                'key',
                'title',
                'path',
                'target_note_id',
                'target_journal_granularity',
                'target_journal_period',
            ]],
        ]);

    expect($response->json('items'))->toBeArray();
    expect(collect($response->json('items'))->contains(
        fn (array $item) => ($item['target_journal_granularity'] ?? null) === Note::JOURNAL_DAILY
    ))->toBeTrue();
    expect(collect($response->json('items'))->contains(
        fn (array $item) => str_contains(strtolower((string) ($item['title'] ?? '')), 'client')
    ))->toBeTrue();
});

test('migrating a task marks source as migrated and appends cloned task to target note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $source = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'task-migrate-source-1',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Prepare migration']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'content' => [['type' => 'text', 'text' => 'Existing content']],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->post('/tasks/migrate', [
            'source_note_id' => $source->id,
            'block_id' => 'task-migrate-source-1',
            'target_note_id' => $target->id,
        ])
        ->assertRedirect();

    $source->refresh();
    $target->refresh();

    $sourceTask = data_get($source->content, 'content.0.content.0');
    expect(data_get($sourceTask, 'attrs.taskStatus'))->toBe('migrated');
    expect(data_get($sourceTask, 'attrs.checked'))->toBeFalse();
    expect(data_get($sourceTask, 'attrs.migratedToNoteId'))->toBe($target->id);
    expect(data_get($sourceTask, 'attrs.migratedFromNoteId'))->toBeNull();
    expect(data_get($sourceTask, 'attrs.migratedFromBlockId'))->toBeNull();
    expect(data_get($sourceTask, 'content.1'))->toBeNull();

    $targetTaskList = collect((array) data_get($target->content, 'content'))
        ->first(fn ($node) => is_array($node) && (($node['type'] ?? null) === 'taskList'));
    $targetTask = data_get($targetTaskList, 'content.0');
    expect((string) data_get($targetTask, 'attrs.id'))->not->toBe('task-migrate-source-1');
    expect(data_get($targetTask, 'attrs.checked'))->toBeFalse();
    expect(data_get($targetTask, 'attrs.taskStatus'))->toBeNull();
    expect(data_get($targetTask, 'attrs.migratedFromNoteId'))->toBe($source->id);
    expect(data_get($targetTask, 'attrs.migratedFromBlockId'))->toBe('task-migrate-source-1');
    expect(data_get($targetTask, 'attrs.migratedToNoteId'))->toBeNull();
    expect(data_get($targetTask, 'content.1'))->toBeNull();

    $sourceIndexed = NoteTask::query()
        ->where('note_id', $source->id)
        ->where('block_id', 'task-migrate-source-1')
        ->first();

    expect($sourceIndexed?->task_status)->toBe('migrated');
});

test('migrating a block task marks source as migrated and appends cloned block task to target note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $source = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Block source note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => [
                    'id' => 'block-task-migrate-source-1',
                    'blockStyle' => 'task',
                    'checked' => false,
                    'taskStatus' => null,
                ],
                'content' => [['type' => 'text', 'text' => 'Prepare block migration']],
            ]],
        ],
    ]);

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Block target note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'paragraph',
                'attrs' => [
                    'blockStyle' => 'paragraph',
                ],
                'content' => [['type' => 'text', 'text' => 'Existing content']],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->post('/tasks/migrate', [
            'source_note_id' => $source->id,
            'block_id' => 'block-task-migrate-source-1',
            'target_note_id' => $target->id,
        ])
        ->assertRedirect();

    $source->refresh();
    $target->refresh();

    $sourceTask = data_get($source->content, 'content.0');
    expect(data_get($sourceTask, 'type'))->toBe('paragraph');
    expect(data_get($sourceTask, 'attrs.blockStyle'))->toBe('task');
    expect(data_get($sourceTask, 'attrs.taskStatus'))->toBe('migrated');
    expect(data_get($sourceTask, 'attrs.checked'))->toBeFalse();
    expect((string) data_get($sourceTask, 'attrs.migratedAt'))->not->toBe('');
    expect(data_get($sourceTask, 'attrs.migratedToNoteId'))->toBe($target->id);
    expect(data_get($sourceTask, 'attrs.migratedFromNoteId'))->toBeNull();
    expect(data_get($sourceTask, 'attrs.migratedFromBlockId'))->toBeNull();

    $targetTask = collect((array) data_get($target->content, 'content'))
        ->last(fn ($node) => is_array($node) && (($node['type'] ?? null) === 'paragraph'));
    expect(data_get($targetTask, 'attrs.blockStyle'))->toBe('task');
    expect((string) data_get($targetTask, 'attrs.id'))->not->toBe('block-task-migrate-source-1');
    expect(data_get($targetTask, 'attrs.checked'))->toBeFalse();
    expect(data_get($targetTask, 'attrs.taskStatus'))->toBeNull();
    expect((string) data_get($targetTask, 'attrs.migratedAt'))->not->toBe('');
    expect(data_get($targetTask, 'attrs.migratedFromNoteId'))->toBe($source->id);
    expect(data_get($targetTask, 'attrs.migratedFromBlockId'))->toBe('block-task-migrate-source-1');
    expect(data_get($targetTask, 'attrs.migratedToNoteId'))->toBeNull();

    $sourceIndexed = NoteTask::query()
        ->where('note_id', $source->id)
        ->where('block_id', 'block-task-migrate-source-1')
        ->first();
    expect($sourceIndexed?->task_status)->toBe('migrated');
    expect($sourceIndexed?->migrated_to_note_id)->toBe($target->id);

    $targetIndexed = NoteTask::query()
        ->where('note_id', $target->id)
        ->where('migrated_from_note_id', $source->id)
        ->first();
    expect($targetIndexed)->not->toBeNull();
    expect($targetIndexed?->task_status)->toBeNull();
});

test('migrated task cannot be toggled via updateChecked', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Origin note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'migrated-block-1',
                        'checked' => false,
                        'taskStatus' => 'migrated',
                        'migratedToNoteId' => '00000000-0000-0000-0000-000000000001',
                    ],
                    'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Migrated task']]]],
                ]],
            ]],
        ],
    ]);

    $task = NoteTask::query()->where('note_id', $note->id)->firstOrFail();

    $this
        ->actingAs($user)
        ->patch("/tasks/{$task->id}/checked", ['checked' => true])
        ->assertStatus(409);

    $note->refresh();
    expect(data_get($note->content, 'content.0.content.0.attrs.checked'))->toBeFalse();
});

test('migrated task cannot be toggled via updateCheckedByReference', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Origin note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'migrated-ref-block-1',
                        'checked' => false,
                        'taskStatus' => 'migrated',
                        'migratedToNoteId' => '00000000-0000-0000-0000-000000000001',
                    ],
                    'content' => [['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Migrated task ref']]]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch('/tasks/checked', [
            'note_id' => $note->id,
            'block_id' => 'migrated-ref-block-1',
            'position' => 1,
            'checked' => true,
        ])
        ->assertStatus(409);

    $note->refresh();
    expect(data_get($note->content, 'content.0.content.0.attrs.checked'))->toBeFalse();
});
