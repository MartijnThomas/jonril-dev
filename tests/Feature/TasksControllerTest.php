<?php

use App\Models\Note;
use App\Models\User;
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
                                        ['type' => 'text', 'text' => 'Call '],
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
            ->where('tasks.data.0.mentions.0', 'Lea')
            ->where('tasks.data.0.hashtags.0', 'work')
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
