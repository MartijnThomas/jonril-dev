<?php

use App\Models\NoteTask;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

test('reindex tasks command rebuilds task index for notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $noteId = (string) Str::uuid();

    DB::table('notes')->insert([
        'id' => $noteId,
        'workspace_id' => $workspace?->id,
        'title' => 'Imported note',
        'type' => 'note',
        'content' => json_encode([
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'taskList',
                    'content' => [
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'dueDate' => '2026-03-09',
                                'priority' => 'high',
                                'taskStatus' => 'canceled',
                                'canceledAt' => '2026-03-10T10:45:00+00:00',
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => 'Imported task'],
                                    ],
                                ],
                            ],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => '< !! Follow up task'],
                                    ],
                                ],
                            ],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => '* ! Starred task'],
                                    ],
                                ],
                            ],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => '? Question task'],
                                    ],
                                ],
                            ],
                        ],
                        [
                            'type' => 'taskItem',
                            'attrs' => [
                                'checked' => false,
                                'startedAt' => '2026-03-10T08:30:00+00:00',
                            ],
                            'content' => [
                                [
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => '/ In progress task'],
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ]),
        'properties' => json_encode([]),
        'parent_id' => null,
        'slug' => 'imported-note',
        'journal_granularity' => null,
        'journal_date' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    expect(NoteTask::query()->where('note_id', $noteId)->count())->toBe(0);

    $this->artisan('notes:reindex-tasks')
        ->expectsOutput('Reindexed note tasks for all users.')
        ->assertSuccessful();

    expect(NoteTask::query()->where('note_id', $noteId)->count())->toBe(5);
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 1)->value('content_text'))->toBe('Imported task');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 1)->value('priority'))->toBe('high');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 1)->value('task_status'))->toBe('canceled');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 1)->value('canceled_at'))->not->toBeNull();
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 2)->value('priority'))->toBe('medium');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 2)->value('task_status'))->toBe('assigned');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 3)->value('priority'))->toBe('normal');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 3)->value('task_status'))->toBe('starred');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 4)->value('task_status'))->toBe('backlog');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 5)->value('task_status'))->toBe('in_progress');
    expect(NoteTask::query()->where('note_id', $noteId)->where('position', 5)->value('started_at'))->not->toBeNull();
});

test('reindex tasks stores nested children separately from parent task text', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $noteId = (string) Str::uuid();

    DB::table('notes')->insert([
        'id' => $noteId,
        'workspace_id' => $workspace?->id,
        'title' => 'Nested index note',
        'type' => 'note',
        'content' => json_encode([
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => (string) Str::uuid(),
                        'checked' => false,
                    ],
                    'content' => [
                        [
                            'type' => 'paragraph',
                            'content' => [
                                ['type' => 'text', 'text' => 'Parent task only'],
                            ],
                        ],
                        [
                            'type' => 'bulletList',
                            'content' => [[
                                'type' => 'listItem',
                                'content' => [[
                                    'type' => 'paragraph',
                                    'content' => [
                                        ['type' => 'text', 'text' => 'Nested bullet child'],
                                    ],
                                ]],
                            ]],
                        ],
                    ],
                ]],
            ]],
        ]),
        'properties' => json_encode([]),
        'parent_id' => null,
        'slug' => 'nested-index-note',
        'journal_granularity' => null,
        'journal_date' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $this->artisan('notes:reindex-tasks')->assertSuccessful();

    /** @var NoteTask $task */
    $task = NoteTask::query()
        ->where('note_id', $noteId)
        ->firstOrFail();

    expect($task->content_text)->toBe('Parent task only');
    expect($task->content_text)->not->toContain('Nested bullet child');
    expect($task->children)->toBeArray();
    expect(data_get($task->children, '0.content_text'))->toBe('Nested bullet child');
    expect(data_get($task->children, '0.list_type'))->toBe('bulletList');
    expect(data_get($task->children, '0.type'))->toBe('listItem');
});

test('reindex tasks command indexes block editor task paragraphs', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $noteId = (string) Str::uuid();
    $firstTaskBlockId = (string) Str::uuid();
    $secondTaskBlockId = (string) Str::uuid();

    DB::table('notes')->insert([
        'id' => $noteId,
        'workspace_id' => $workspace?->id,
        'title' => 'Block task note',
        'type' => 'note',
        'content' => json_encode([
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => [
                        'level' => 2,
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => 'Today'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => $firstTaskBlockId,
                        'blockStyle' => 'task',
                        'checked' => false,
                        'taskStatus' => 'in_progress',
                        'dueDate' => '2026-03-20',
                        'deadlineDate' => '2026-03-21',
                        'startedAt' => '2026-03-14T09:30:00+00:00',
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => '/ !! Block task one'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => $secondTaskBlockId,
                        'blockStyle' => 'task',
                        'checked' => false,
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => '? Block task two'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => (string) Str::uuid(),
                        'blockStyle' => 'task',
                        'checked' => false,
                        'taskStatus' => 'backlog',
                        'backlogPromotedAt' => '2026-03-14T10:15:00+00:00',
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => 'Backlog via attrs should stay backlog'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => (string) Str::uuid(),
                        'blockStyle' => 'task',
                        'checked' => false,
                        'backlogPromotedAt' => '2026-03-14T10:20:00+00:00',
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => '? Stale backlog marker should not re-open'],
                    ],
                ],
            ],
        ]),
        'properties' => json_encode([]),
        'parent_id' => null,
        'slug' => 'block-task-note',
        'journal_granularity' => null,
        'journal_date' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    expect(NoteTask::query()->where('note_id', $noteId)->count())->toBe(0);

    $this->artisan('notes:reindex-tasks')
        ->expectsOutput('Reindexed note tasks for all users.')
        ->assertSuccessful();

    expect(NoteTask::query()->where('note_id', $noteId)->count())->toBe(4);

    $firstTask = NoteTask::query()
        ->where('note_id', $noteId)
        ->where('block_id', $firstTaskBlockId)
        ->firstOrFail();
    $secondTask = NoteTask::query()
        ->where('note_id', $noteId)
        ->where('block_id', $secondTaskBlockId)
        ->firstOrFail();

    expect($firstTask->task_status)->toBe('in_progress');
    expect($firstTask->priority)->toBe('medium');
    expect($firstTask->due_date?->toDateString())->toBe('2026-03-20');
    expect($firstTask->deadline_date?->toDateString())->toBe('2026-03-21');
    expect($firstTask->started_at)->not->toBeNull();
    expect($firstTask->content_text)->toContain('Block task one');

    expect($secondTask->task_status)->toBe('backlog');
    expect($secondTask->priority)->toBeNull();
    expect($secondTask->content_text)->toContain('Block task two');

    $thirdTask = NoteTask::query()
        ->where('note_id', $noteId)
        ->where('content_text', 'Backlog via attrs should stay backlog')
        ->firstOrFail();
    $fourthTask = NoteTask::query()
        ->where('note_id', $noteId)
        ->where('content_text', '? Stale backlog marker should not re-open')
        ->firstOrFail();

    expect($thirdTask->task_status)->toBe('backlog');
    expect($thirdTask->backlog_promoted_at)->not->toBeNull();
    expect($fourthTask->task_status)->toBeNull();
    expect($fourthTask->backlog_promoted_at)->not->toBeNull();
});

test('reindex tasks command stores week and month task date tokens', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $noteId = (string) Str::uuid();

    DB::table('notes')->insert([
        'id' => $noteId,
        'workspace_id' => $workspace?->id,
        'title' => 'Task token note',
        'type' => 'note',
        'content' => json_encode([
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [
                    [
                        'type' => 'taskItem',
                        'attrs' => ['checked' => false],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [['type' => 'text', 'text' => 'Weekly due >2026-w2']],
                        ]],
                    ],
                    [
                        'type' => 'taskItem',
                        'attrs' => ['checked' => false],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [['type' => 'text', 'text' => 'Monthly deadline >>2026-6']],
                        ]],
                    ],
                ],
            ]],
        ]),
        'properties' => json_encode([]),
        'parent_id' => null,
        'slug' => 'task-token-note',
        'journal_granularity' => null,
        'journal_date' => null,
        'created_at' => now(),
        'updated_at' => now(),
    ]);

    $this->artisan('notes:reindex-tasks')->assertSuccessful();

    expect(
        NoteTask::query()->where('note_id', $noteId)->where('position', 1)->value('due_date_token'),
    )->toBe('2026-W02');
    expect(
        NoteTask::query()->where('note_id', $noteId)->where('position', 1)->value('due_date'),
    )->toBeNull();

    expect(
        NoteTask::query()->where('note_id', $noteId)->where('position', 2)->value('deadline_date_token'),
    )->toBe('2026-06');
    expect(
        NoteTask::query()->where('note_id', $noteId)->where('position', 2)->value('deadline_date'),
    )->toBeNull();
});
