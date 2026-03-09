<?php

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;
use App\Models\Workspace;
use Inertia\Testing\AssertableInertia as Assert;

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
                                        ['type' => 'text', 'text' => '< ! Call '],
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
            ->where('tasks.data.0.task_status', 'assigned')
            ->where('tasks.data.0.priority', 'normal')
            ->where('tasks.data.0.mentions.0', 'Lea')
            ->where('tasks.data.0.hashtags.0', 'work')
            ->where('tasks.data.0.render_fragments.0.type', 'status_token')
            ->where('tasks.data.0.render_fragments.0.status', 'assigned')
            ->where('tasks.data.0.render_fragments.2.type', 'priority_token')
            ->where('tasks.data.0.render_fragments.2.priority', 'normal')
            ->where('filters.show_completed', false),
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

test('tasks index date range filter matches due or deadline dates', function () {
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

    $this
        ->actingAs($user)
        ->get('/tasks?date_from=2026-03-09&date_to=2026-03-15')
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.date_from', '2026-03-09')
            ->where('filters.date_to', '2026-03-15')
            ->has('tasks.data', 2),
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

test('tasks index includes tasks across all user workspaces and can filter by workspace', function () {
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
            ->where('filters.workspace_id', '')
            ->has('tasks.data', 2)
            ->where('tasks.data.0.note.workspace_id', fn ($id) => in_array($id, [$primaryWorkspace?->id, $secondaryWorkspace->id], true))
            ->where('tasks.data.1.note.workspace_id', fn ($id) => in_array($id, [$primaryWorkspace?->id, $secondaryWorkspace->id], true)),
        );

    $this
        ->actingAs($user)
        ->get('/tasks?workspace_id='.$secondaryWorkspace->id)
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.workspace_id', $secondaryWorkspace->id)
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
        ->get('/tasks?note_scope_id='.$parent->id)
        ->assertInertia(fn (Assert $page) => $page
            ->component('tasks/index')
            ->where('filters.note_scope_id', $parent->id)
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
    expect($reindexedTask?->checked)->toBeTrue();
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
    expect($reindexedTask)->not->toBeNull();
    expect($reindexedTask?->checked)->toBeFalse();
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
