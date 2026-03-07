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

    expect(NoteTask::query()->where('note_id', $noteId)->count())->toBe(1);
    expect(NoteTask::query()->where('note_id', $noteId)->value('content_text'))->toBe('Imported task');
});
