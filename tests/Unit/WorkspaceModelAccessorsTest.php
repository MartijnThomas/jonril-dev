<?php

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

test('workspace accessors provide defaults for color and icon', function () {
    $owner = User::factory()->create();

    $workspace = Workspace::query()->create([
        'owner_id' => $owner->id,
        'name' => 'Defaulted Workspace',
        'color' => '   ',
        'icon' => '',
    ]);

    expect($workspace->color)->toBe(Workspace::DEFAULT_COLOR);
    expect($workspace->icon)->toBe(Workspace::DEFAULT_ICON);
});

test('workspace accessors preserve explicit color and icon values', function () {
    $owner = User::factory()->create();

    $workspace = Workspace::query()->create([
        'owner_id' => $owner->id,
        'name' => 'Custom Workspace',
        'color' => 'emerald',
        'icon' => 'rocket',
    ]);

    expect($workspace->color)->toBe('emerald');
    expect($workspace->icon)->toBe('rocket');
});
