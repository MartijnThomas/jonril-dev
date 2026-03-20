<?php

use App\Models\Workspace;

test('workspace resolves storage disk to default when override is empty', function () {
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public', 's3-team']);

    $workspace = Workspace::factory()->create([
        'storage_disk' => null,
    ]);

    expect($workspace->resolvedStorageDisk())->toBe('public');
});

test('workspace resolves storage disk to configured override when allowed', function () {
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public', 's3-team']);

    $workspace = Workspace::factory()->create([
        'storage_disk' => 's3-team',
    ]);

    expect($workspace->resolvedStorageDisk())->toBe('s3-team');
});

test('workspace falls back to default when configured override is not allowed', function () {
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public', 's3-team']);

    $workspace = Workspace::factory()->create([
        'storage_disk' => 'legacy-private',
    ]);

    expect($workspace->resolvedStorageDisk())->toBe('public');
});

test('workspace image storage directory is rooted under configurable image folder', function () {
    config()->set('note-images.folder', 'assets/images');

    $workspace = Workspace::factory()->create();

    expect($workspace->imageStorageDirectory())->toBe("assets/images/workspaces/{$workspace->id}");
});
