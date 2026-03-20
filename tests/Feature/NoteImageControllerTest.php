<?php

use App\Models\Note;
use App\Models\NoteImage;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

test('workspace member can upload image and gets scoped src url', function () {
    Storage::fake('public');
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public']);
    config()->set('note-images.folder', 'uploads/images');

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
    ]);

    $response = $this
        ->actingAs($user)
        ->postJson("/w/{$workspace->slug}/images", [
            'file' => UploadedFile::fake()->image('plan.png', 240, 120)->size(120),
            'note_id' => $note->id,
            'alt' => 'Project diagram',
        ]);

    $response
        ->assertCreated()
        ->assertJsonPath('alt', 'Project diagram')
        ->assertJsonPath('mime_type', 'image/png');

    $image = NoteImage::query()->first();

    expect($image)->not->toBeNull();
    expect($image?->workspace_id)->toBe($workspace->id);
    expect($image?->note_id)->toBe($note->id);
    expect($image?->uploaded_by)->toBe($user->id);
    expect($image?->disk)->toBe('public');
    expect($image?->path)->toStartWith("uploads/images/workspaces/{$workspace->id}/");
    expect($image?->status)->toBe('active');

    Storage::disk('public')->assertExists($image->path);
});

test('upload uses workspace storage disk override when allowed', function () {
    config()->set('filesystems.disks.s3-team', [
        'driver' => 'local',
        'root' => storage_path('framework/testing/disks/s3-team'),
        'throw' => false,
    ]);
    Storage::fake('s3-team');
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public', 's3-team']);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace->forceFill(['storage_disk' => 's3-team'])->save();

    $this
        ->actingAs($user)
        ->postJson("/w/{$workspace->slug}/images", [
            'file' => UploadedFile::fake()->image('override.png', 100, 100)->size(80),
        ])
        ->assertCreated();

    $image = NoteImage::query()->first();
    expect($image?->disk)->toBe('s3-team');
    Storage::disk('s3-team')->assertExists($image->path);
});

test('non member cannot upload image', function () {
    Storage::fake('public');
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public']);

    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $outsider = User::factory()->create();

    $this
        ->actingAs($outsider)
        ->postJson("/w/{$workspace->slug}/images", [
            'file' => UploadedFile::fake()->image('forbidden.png'),
        ])
        ->assertForbidden();
});

test('upload validates image requirement', function () {
    Storage::fake('public');
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public']);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $this
        ->actingAs($user)
        ->postJson("/w/{$workspace->slug}/images", [
            'file' => UploadedFile::fake()->create('file.txt', 10, 'text/plain'),
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['file']);
});

test('workspace member can fetch uploaded image from scoped route', function () {
    Storage::fake('public');
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public']);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $path = "uploads/images/workspaces/{$workspace->id}/2026/03/test-image.png";
    Storage::disk('public')->put($path, 'image-bytes');

    $image = NoteImage::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => null,
        'uploaded_by' => $user->id,
        'disk' => 'public',
        'path' => $path,
        'filename' => 'test-image.png',
        'mime_type' => 'image/png',
        'size_bytes' => 10,
        'width' => 100,
        'height' => 100,
        'sha256' => hash('sha256', 'image-bytes'),
        'status' => 'active',
    ]);

    $this
        ->actingAs($user)
        ->get("/w/{$workspace->slug}/images/{$image->id}")
        ->assertOk();
});

test('fetch image is forbidden for non member', function () {
    Storage::fake('public');
    config()->set('note-images.default_disk', 'public');
    config()->set('note-images.allowed_disks', ['public']);

    $owner = User::factory()->create();
    $workspace = $owner->currentWorkspace();
    $outsider = User::factory()->create();

    $path = "uploads/images/workspaces/{$workspace->id}/2026/03/test-image.png";
    Storage::disk('public')->put($path, 'image-bytes');

    $image = NoteImage::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => null,
        'uploaded_by' => $owner->id,
        'disk' => 'public',
        'path' => $path,
        'filename' => 'test-image.png',
        'mime_type' => 'image/png',
        'size_bytes' => 10,
        'width' => 100,
        'height' => 100,
        'sha256' => hash('sha256', 'image-bytes'),
        'status' => 'active',
    ]);

    $this
        ->actingAs($outsider)
        ->get("/w/{$workspace->slug}/images/{$image->id}")
        ->assertForbidden();
});
