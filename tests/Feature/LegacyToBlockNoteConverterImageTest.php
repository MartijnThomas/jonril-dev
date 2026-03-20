<?php

use App\Models\Note;
use App\Support\Notes\LegacyToBlockNoteConverter;
use Illuminate\Support\Str;

test('converter keeps image nodes when normalizing an existing block document', function () {
    $note = Note::factory()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Image persistence',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => [
                        'id' => (string) Str::uuid(),
                        'level' => 1,
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => 'Image persistence'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => (string) Str::uuid(),
                        'indent' => 0,
                        'blockStyle' => 'bullet',
                        'order' => 1,
                        'checked' => false,
                        'taskStatus' => null,
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => 'Bullet before image'],
                    ],
                ],
                [
                    'type' => 'image',
                    'attrs' => [
                        'src' => '/w/test/images/example',
                        'alt' => 'example',
                        'title' => 'example',
                    ],
                ],
            ],
        ],
    ]);

    $result = app(LegacyToBlockNoteConverter::class)->convertNote($note);

    $nodes = $result['document']['content'] ?? [];
    $imageNode = collect($nodes)->first(fn ($node) => ($node['type'] ?? null) === 'image');

    expect($imageNode)->toBeArray();
    expect(data_get($imageNode, 'attrs.src'))->toBe('/w/test/images/example');
    expect(data_get($imageNode, 'attrs.alt'))->toBe('example');
    expect(data_get($imageNode, 'attrs.title'))->toBe('example');
});
