<?php

use App\Support\Notes\NoteTitleExtractor;

it('uses first h1 as title when available', function () {
    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Intro line'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Main Title'],
                ],
            ],
        ],
    ];

    $title = app(NoteTitleExtractor::class)->extract($content);

    expect($title)->toBe('Main Title');
});

it('falls back to first text line when no h1 exists', function () {
    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'First line'],
                    ['type' => 'hardBreak'],
                    ['type' => 'text', 'text' => 'Second line'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 2],
                'content' => [
                    ['type' => 'text', 'text' => 'Secondary'],
                ],
            ],
        ],
    ];

    $title = app(NoteTitleExtractor::class)->extract($content);

    expect($title)->toBe('First line');
});

it('accepts json string content', function () {
    $content = json_encode([
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'JSON Title'],
                ],
            ],
        ],
    ], JSON_THROW_ON_ERROR);

    $title = app(NoteTitleExtractor::class)->extract($content);

    expect($title)->toBe('JSON Title');
});

it('strips markdown heading prefixes from extracted title', function () {
    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => '#### Block style editor'],
                ],
            ],
        ],
    ];

    $title = app(NoteTitleExtractor::class)->extract($content);

    expect($title)->toBe('Block style editor');
});
