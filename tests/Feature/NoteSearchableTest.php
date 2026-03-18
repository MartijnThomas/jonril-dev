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
        'journal_path_nl' => null,
        'journal_path_en' => null,
        'headings' => ['Auth Work'],
        'headings_with_level' => ['## Auth Work'],
        'workspace_id' => $child->workspace_id,
        'type' => Note::TYPE_NOTE,
        'journal_granularity' => null,
        'journal_date' => null,
    ]);
});

test('journal note searchable payload includes nl and en journal paths', function () {
    $user = User::factory()->create();

    $journal = $user->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-18',
        'title' => 'Woensdag 18 maart 2026',
    ]);

    $payload = $journal->toSearchableArray();

    expect($payload['journal_path_nl'] ?? null)->toBe('2026 > Maart > Week 12');
    expect($payload['journal_path_en'] ?? null)->toBe('2026 > March > Week 12');
});
