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
