<?php

use App\Models\Note;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

test('note property accessors expose icon values from properties', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Icon test',
        'properties' => [
            'icon' => 'rocket',
            'icon-color' => 'orange',
            'icon-bg' => 'stone',
        ],
    ]);

    expect($note->icon)->toBe('rocket');
    expect($note->icon_color)->toBe('orange');
    expect($note->icon_bg)->toBe('stone');
});

test('note property accessors normalize empty values to null', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Icon test',
        'properties' => [
            'icon' => '   ',
            'icon-color' => '',
            'icon-bg' => null,
        ],
    ]);

    expect($note->icon)->toBeNull();
    expect($note->icon_color)->toBeNull();
    expect($note->icon_bg)->toBeNull();
});

test('journal notes expose default icon and icon color through accessors', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $daily = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-08',
        'title' => 'Zondag 8 maart 2026',
        'properties' => [],
    ]);

    expect($daily->icon)->toBe(Note::JOURNAL_ICON_DEFAULTS[Note::JOURNAL_DAILY]);
    expect($daily->icon_color)->toBe(Note::JOURNAL_ICON_COLOR_DEFAULT);
    expect($daily->icon_bg)->toBeNull();
});

test('journal notes allow overriding icon and icon color through properties', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $daily = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-08',
        'title' => 'Zondag 8 maart 2026',
        'properties' => [
            'icon' => 'alarm-clock',
            'icon-color' => 'sky',
            'icon-bg' => 'stone',
        ],
    ]);

    expect($daily->icon)->toBe('alarm-clock');
    expect($daily->icon_color)->toBe('sky');
    expect($daily->icon_bg)->toBe('stone');
});

test('note path accessor returns hierarchy path including title overrides', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'parent_id' => $root->id,
    ]);
    $leaf = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Leaf',
        'parent_id' => $child->id,
        'properties' => [
            'title' => 'Override Leaf',
        ],
    ]);

    expect($root->path)->toBe('Root');
    expect($child->path)->toBe('Root / Child');
    expect($leaf->path)->toBe('Root / Child / Override Leaf');
});

test('note context and tags accessors normalize properties', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Meta',
        'properties' => [
            'context' => '  client-a  ',
            'tags' => ['#ops', ' platform ', '', '#'],
        ],
    ]);

    expect($note->context)->toBe('client-a');
    expect($note->tags)->toBe(['ops', 'platform']);
});

test('note display title falls back to Untitled for null or empty title', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $nullTitle = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => null,
    ]);

    $emptyTitle = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => '   ',
    ]);

    expect($nullTitle->display_title)->toBe('Untitled');
    expect($emptyTitle->display_title)->toBe('Untitled');
});
