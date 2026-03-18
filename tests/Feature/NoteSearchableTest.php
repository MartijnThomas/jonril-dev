<?php

use App\Models\Note;
use App\Models\User;

test('note searchable payload includes parent path titles', function () {
    $user = User::factory()->create();

    $parent = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Engineering',
    ]);

    $child = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Fix auth flow',
        'parent_id' => $parent->id,
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 2],
                    'content' => [
                        ['type' => 'text', 'text' => 'Auth Work'],
                    ],
                ],
            ],
        ],
    ]);

    expect($child->toSearchableArray())->toBe([
        'title' => 'Fix auth flow',
        'path_titles' => 'Engineering',
        'headings' => ['Auth Work'],
        'headings_with_level' => ['## Auth Work'],
        'workspace_id' => $child->workspace_id,
        'type' => Note::TYPE_NOTE,
        'journal_granularity' => null,
        'journal_date' => null,
    ]);
});
