<?php

use App\Models\Note;
use App\Support\Notes\LegacyToBlockNoteConverter;

it('converts a legacy document fixture with mixed nodes into block document nodes', function () {
    $converter = new LegacyToBlockNoteConverter;

    $note = new Note;
    $note->type = Note::TYPE_NOTE;
    $note->title = 'Fixture title';
    $note->content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => '# Fixture title'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 2],
                'content' => [
                    ['type' => 'text', 'text' => '## Heading two'],
                ],
            ],
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Inline tokens: '],
                    [
                        'type' => 'mention',
                        'attrs' => [
                            'id' => 'AidaBiglari',
                            'label' => 'AidaBiglari',
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
            ],
            [
                'type' => 'blockquote',
                'content' => [
                    [
                        'type' => 'paragraph',
                        'content' => [
                            ['type' => 'text', 'text' => 'Quoted paragraph'],
                        ],
                    ],
                ],
            ],
            [
                'type' => 'bulletList',
                'content' => [
                    [
                        'type' => 'listItem',
                        'attrs' => [
                            'priority' => 'medium',
                        ],
                        'content' => [
                            [
                                'type' => 'paragraph',
                                'content' => [
                                    [
                                        'type' => 'text',
                                        'text' => 'Bullet level 0',
                                        'marks' => [
                                            [
                                                'type' => 'highlight',
                                                'attrs' => ['color' => 'rgba(251, 146, 60, 0.16)'],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                            [
                                'type' => 'orderedList',
                                'content' => [
                                    [
                                        'type' => 'listItem',
                                        'content' => [
                                            [
                                                'type' => 'paragraph',
                                                'content' => [
                                                    ['type' => 'text', 'text' => 'Ordered nested'],
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
            [
                'type' => 'taskList',
                'content' => [
                    [
                        'type' => 'taskItem',
                        'attrs' => [
                            'checked' => false,
                            'priority' => 'high',
                            'taskStatus' => 'in_progress',
                            'dueDate' => '2026-03-20',
                            'deadlineDate' => '2026-03-21',
                        ],
                        'content' => [
                            [
                                'type' => 'paragraph',
                                'content' => [
                                    [
                                        'type' => 'text',
                                        'text' => '/ Task content',
                                        'marks' => [
                                            [
                                                'type' => 'highlight',
                                                'attrs' => ['color' => 'rgba(248, 113, 113, 0.16)'],
                                            ],
                                        ],
                                    ],
                                ],
                            ],
                        ],
                    ],
                    [
                        'type' => 'taskItem',
                        'attrs' => [
                            'checked' => false,
                            'taskStatus' => 'canceled',
                        ],
                        'content' => [
                            [
                                'type' => 'paragraph',
                                'content' => [
                                    ['type' => 'text', 'text' => '— Canceled task'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ];

    $result = $converter->convertNote($note);

    expect($result['changed'])->toBeTrue();
    expect($result['was_block_document'])->toBeFalse();
    expect($result['document']['type'])->toBe('doc');

    $nodes = $result['document']['content'];

    expect($nodes[0]['type'])->toBe('heading');
    expect($nodes[0]['attrs']['level'])->toBe(1);
    expect($nodes[0]['content'][0]['text'])->toBe('Fixture title');

    $hasQuoteParagraph = collect($nodes)->contains(
        fn (array $node) => ($node['type'] ?? null) === 'paragraph'
            && ($node['attrs']['blockStyle'] ?? null) === 'quote'
            && ($node['content'][0]['text'] ?? null) === 'Quoted paragraph',
    );

    $hasBulletParagraph = collect($nodes)->contains(
        fn (array $node) => ($node['type'] ?? null) === 'paragraph'
            && ($node['attrs']['blockStyle'] ?? null) === 'bullet'
            && ($node['attrs']['indent'] ?? null) === 0
            && ($node['content'][0]['text'] ?? null) === '!! Bullet level 0',
    );

    $hasNestedOrderedParagraph = collect($nodes)->contains(
        fn (array $node) => ($node['type'] ?? null) === 'paragraph'
            && ($node['attrs']['blockStyle'] ?? null) === 'ordered'
            && ($node['attrs']['indent'] ?? null) === 1
            && ($node['attrs']['order'] ?? null) === 1
            && ($node['content'][0]['text'] ?? null) === 'Ordered nested',
    );

    $taskNode = collect($nodes)->first(
        fn (array $node) => ($node['type'] ?? null) === 'paragraph'
            && ($node['attrs']['blockStyle'] ?? null) === 'task',
    );

    expect($hasQuoteParagraph)->toBeTrue();
    expect($hasBulletParagraph)->toBeTrue();
    expect($hasNestedOrderedParagraph)->toBeTrue();
    expect($taskNode)->not->toBeNull();
    expect($taskNode['attrs']['taskStatus'])->toBe('in_progress');
    expect($taskNode['attrs']['priority'])->toBe('high');
    expect($taskNode['attrs']['dueDate'])->toBe('2026-03-20');
    expect($taskNode['attrs']['deadlineDate'])->toBe('2026-03-21');
    expect($taskNode['content'][0]['text'] ?? null)->toBe('/ !!! Task content');
    expect($taskNode['content'][0]['marks'] ?? null)->toBeNull();

    $canceledTaskNode = collect($nodes)->first(
        fn (array $node) => ($node['type'] ?? null) === 'paragraph'
            && ($node['attrs']['blockStyle'] ?? null) === 'task'
            && ($node['attrs']['taskStatus'] ?? null) === 'canceled',
    );
    expect($canceledTaskNode)->not->toBeNull();
    expect($canceledTaskNode['content'][0]['text'] ?? null)->toBe('- Canceled task');

    $containsMentionOrHashtagInlineNodes = collect($nodes)
        ->flatMap(fn (array $node) => collect($node['content'] ?? []))
        ->contains(fn (array $inlineNode) => in_array($inlineNode['type'] ?? null, ['mention', 'hashtag'], true));
    expect($containsMentionOrHashtagInlineNodes)->toBeFalse();

    $containsConvertedTokenText = collect($nodes)
        ->flatMap(fn (array $node) => collect($node['content'] ?? []))
        ->contains(fn (array $inlineNode) => ($inlineNode['type'] ?? null) === 'text'
            && in_array(($inlineNode['text'] ?? null), ['@AidaBiglari', '#work'], true));
    expect($containsConvertedTokenText)->toBeTrue();

    $allHaveIds = collect($nodes)->every(function (array $node): bool {
        if (($node['type'] ?? null) === 'heading') {
            return is_string($node['attrs']['id'] ?? null) && trim((string) $node['attrs']['id']) !== '';
        }

        if (($node['type'] ?? null) === 'paragraph') {
            return is_string($node['attrs']['id'] ?? null) && trim((string) $node['attrs']['id']) !== '';
        }

        return true;
    });

    expect($allHaveIds)->toBeTrue();
});

it('forces a leading h1 for converted daily journal output', function () {
    $converter = new LegacyToBlockNoteConverter;

    $journal = new Note;
    $journal->type = Note::TYPE_JOURNAL;
    $journal->journal_granularity = Note::JOURNAL_DAILY;
    $journal->title = 'Vrijdag 13 maart 2026';
    $journal->content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => '# Vrijdag 13 maart 2026'],
                ],
            ],
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Body'],
                ],
            ],
        ],
    ];

    $result = $converter->convertNote($journal);

    expect($result['document']['content'][0]['type'])->toBe('heading');
    expect($result['document']['content'][0]['attrs']['level'])->toBe(1);
    expect($result['document']['content'][0]['content'][0]['text'])->toBe('Vrijdag 13 maart 2026');
    expect($result['document']['content'][1]['type'])->toBe('paragraph');
    expect($result['document']['content'][1]['content'][0]['text'])->toBe('Body');
});

it('converts legacy deferred task prefix to assigned or deferred status and strips prefix text', function () {
    $converter = new LegacyToBlockNoteConverter;

    $note = new Note;
    $note->type = Note::TYPE_NOTE;
    $note->title = 'Deferred conversion';
    $note->content = [
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
                            'content' => [
                                ['type' => 'text', 'text' => '< Follow up with @Dori and @Aida'],
                            ],
                        ]],
                    ],
                    [
                        'type' => 'taskItem',
                        'attrs' => ['checked' => false],
                        'content' => [[
                            'type' => 'paragraph',
                            'content' => [
                                ['type' => 'text', 'text' => '< Waiting on vendor response'],
                            ],
                        ]],
                    ],
                ],
            ],
        ],
    ];

    $result = $converter->convertNote($note);
    $taskNodes = collect($result['document']['content'])
        ->filter(fn (array $node): bool => ($node['type'] ?? null) === 'paragraph'
            && (($node['attrs']['blockStyle'] ?? null) === 'task'))
        ->values();

    expect($taskNodes)->toHaveCount(2);

    $firstTask = $taskNodes[0];
    expect($firstTask['attrs']['taskStatus'] ?? null)->toBe('deferred');
    expect($firstTask['attrs']['assignee'] ?? null)->toBeNull();
    expect($firstTask['content'][0]['text'] ?? null)->toBe('< Follow up with @Dori and @Aida');

    $deferredTask = $taskNodes[1];
    expect($deferredTask['attrs']['taskStatus'] ?? null)->toBe('deferred');
    expect($deferredTask['attrs']['assignee'] ?? null)->toBeNull();
    expect($deferredTask['content'][0]['text'] ?? null)->toBe('< Waiting on vendor response');
});

it('keeps deferred marker text when no assignee mention is present', function () {
    $converter = new LegacyToBlockNoteConverter;

    $note = new Note;
    $note->type = Note::TYPE_NOTE;
    $note->title = 'Deferred empty';
    $note->content = [
        'type' => 'doc',
        'content' => [[
            'type' => 'taskList',
            'content' => [[
                'type' => 'taskItem',
                'attrs' => ['checked' => false],
                'content' => [[
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => '< '],
                    ],
                ]],
            ]],
        ]],
    ];

    $result = $converter->convertNote($note);
    $taskNode = collect($result['document']['content'])->first(
        fn (array $node): bool => ($node['type'] ?? null) === 'paragraph'
            && (($node['attrs']['blockStyle'] ?? null) === 'task'),
    );

    expect($taskNode)->not->toBeNull();
    expect($taskNode['attrs']['taskStatus'] ?? null)->toBe('deferred');
    expect($taskNode['content'][0]['text'] ?? null)->toBe('< ');
});

it('converts legacy checkList nodes to block checklist paragraphs', function () {
    $converter = new LegacyToBlockNoteConverter;

    $note = new Note;
    $note->type = Note::TYPE_NOTE;
    $note->title = 'Checklist conversion';
    $note->content = [
        'type' => 'doc',
        'content' => [[
            'type' => 'checkList',
            'content' => [
                [
                    'type' => 'checkItem',
                    'attrs' => ['checked' => true],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [
                            ['type' => 'text', 'text' => 'Checked checklist item'],
                        ],
                    ]],
                ],
                [
                    'type' => 'checkItem',
                    'attrs' => ['checked' => false],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [
                            ['type' => 'text', 'text' => 'Open checklist item'],
                        ],
                    ]],
                ],
            ],
        ]],
    ];

    $result = $converter->convertNote($note);
    $checklistNodes = collect($result['document']['content'])
        ->filter(fn (array $node): bool => ($node['type'] ?? null) === 'paragraph'
            && (($node['attrs']['blockStyle'] ?? null) === 'checklist'))
        ->values();

    expect($checklistNodes)->toHaveCount(2);
    expect($checklistNodes[0]['attrs']['checked'] ?? null)->toBeTrue();
    expect($checklistNodes[0]['attrs']['taskStatus'] ?? null)->toBeNull();
    expect($checklistNodes[0]['content'][0]['text'] ?? null)->toBe('Checked checklist item');
    expect($checklistNodes[1]['attrs']['checked'] ?? null)->toBeFalse();
    expect($checklistNodes[1]['content'][0]['text'] ?? null)->toBe('Open checklist item');
});
