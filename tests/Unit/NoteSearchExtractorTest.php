<?php

use App\Support\Notes\NoteSearchExtractor;

it('extracts deterministic content text headings mentions and hashtags from note content', function () {
    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 2, 'id' => 'h-1'],
                'content' => [
                    ['type' => 'text', 'text' => '## Sprint Planning'],
                ],
            ],
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Discuss with @Lea and #Launch team'],
                    ['type' => 'hardBreak'],
                    ['type' => 'mention', 'attrs' => ['id' => 'Mia', 'label' => 'Mia']],
                    ['type' => 'text', 'text' => ' follow-up'],
                ],
            ],
        ],
    ];

    $result = app(NoteSearchExtractor::class)->extract($content);

    expect($result['content_text'])->toContain('Sprint Planning');
    expect($result['content_text'])->toContain('Discuss with @Lea and #Launch team');
    expect($result['heading_terms'])->toBe(['Sprint Planning']);
    expect($result['mentions'])->toBe(['lea', 'mia']);
    expect($result['hashtags'])->toBe(['launch']);
});

it('extracts tags property terms and task terms deterministically', function () {
    $properties = [
        'tags' => ['#Roadmap', 'Backend'],
        'context' => 'Acme Corp',
        'owner' => [
            'name' => 'Lea',
        ],
    ];

    $result = app(NoteSearchExtractor::class)->extract(
        content: null,
        properties: $properties,
        taskTerms: ['Prepare backlog', 'Refine sprint'],
    );

    expect($result['content_text'])->toBe('');
    expect($result['tags'])->toBe(['roadmap', 'backend']);
    expect($result['task_terms'])->toBe(['Prepare backlog', 'Refine sprint']);
    expect($result['property_terms'])->toContain('context');
    expect($result['property_terms'])->toContain('acme corp');
    expect($result['property_terms'])->toContain('owner');
    expect($result['property_terms'])->toContain('name');
    expect($result['property_terms'])->toContain('lea');
});

it('accepts json string content and keeps heading terms unique', function () {
    $content = json_encode([
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1, 'id' => 'h-1'],
                'content' => [
                    ['type' => 'text', 'text' => 'Roadmap'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 2, 'id' => 'h-2'],
                'content' => [
                    ['type' => 'text', 'text' => 'Roadmap'],
                ],
            ],
        ],
    ], JSON_THROW_ON_ERROR);

    $result = app(NoteSearchExtractor::class)->extract($content);

    expect($result['heading_terms'])->toBe(['Roadmap']);
});
