<?php

use App\Models\Note;
use App\Models\NoteImage;
use App\Models\User;
use Illuminate\Support\Facades\Storage;

test('prune note images marks stale unattached uploads as orphaned', function () {
    config()->set('note-images.unattached_grace_hours', 24);
    config()->set('note-images.orphan_retention_days', 7);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $stale = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'note_id' => null,
        'status' => 'active',
        'created_at' => now()->subHours(30),
        'updated_at' => now()->subHours(30),
    ]);

    $fresh = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'note_id' => null,
        'status' => 'active',
        'created_at' => now()->subHours(2),
        'updated_at' => now()->subHours(2),
    ]);

    $this->artisan('notes:prune-images')
        ->assertSuccessful();

    expect($stale->fresh()?->status)->toBe('orphaned');
    expect($fresh->fresh()?->status)->toBe('active');
});

test('prune note images keeps referenced images and orphans unreferenced note images', function () {
    config()->set('note-images.unattached_grace_hours', 24);
    config()->set('note-images.orphan_retention_days', 7);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $referenced = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'note_id' => $note->id,
        'status' => 'active',
    ]);

    $unreferenced = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'note_id' => $note->id,
        'status' => 'active',
    ]);

    $note->forceFill([
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'image',
                    'attrs' => [
                        'src' => "/w/{$workspace->slug}/images/{$referenced->id}",
                        'alt' => 'x',
                    ],
                ],
            ],
        ],
    ])->save();

    $this->artisan('notes:prune-images')
        ->assertSuccessful();

    expect($referenced->fresh()?->status)->toBe('active');
    expect($unreferenced->fresh()?->status)->toBe('orphaned');
});

test('prune note images keeps images referenced by any remaining revision', function () {
    config()->set('note-images.unattached_grace_hours', 24);
    config()->set('note-images.orphan_retention_days', 7);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $image = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'note_id' => $note->id,
        'status' => 'active',
    ]);

    $note->revisions()->create([
        'user_id' => $user->id,
        'title' => $note->title,
        'properties' => null,
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'image',
                    'attrs' => [
                        'src' => "/w/{$workspace->slug}/images/{$image->id}",
                    ],
                ],
            ],
        ],
    ]);

    $this->artisan('notes:prune-images')
        ->assertSuccessful();

    expect($image->fresh()?->status)->toBe('active');
});

test('prune note images can orphan image after referencing revision is deleted', function () {
    config()->set('note-images.unattached_grace_hours', 24);
    config()->set('note-images.orphan_retention_days', 7);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $image = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'note_id' => $note->id,
        'status' => 'active',
    ]);

    $revision = $note->revisions()->create([
        'user_id' => $user->id,
        'title' => $note->title,
        'properties' => null,
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'image',
                    'attrs' => [
                        'src' => "/w/{$workspace->slug}/images/{$image->id}",
                    ],
                ],
            ],
        ],
    ]);

    $this->artisan('notes:prune-images')
        ->assertSuccessful();
    expect($image->fresh()?->status)->toBe('active');

    $revision->delete();

    $this->artisan('notes:prune-images')
        ->assertSuccessful();

    expect($image->fresh()?->status)->toBe('orphaned');
});

test('prune note images deletes expired orphaned rows and files', function () {
    Storage::fake('public');
    config()->set('note-images.orphan_retention_days', 7);
    config()->set('note-images.unattached_grace_hours', 24);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $path = "uploads/images/workspaces/{$workspace->id}/2026/03/prune-test.png";
    Storage::disk('public')->put($path, 'image-bytes');

    $oldOrphan = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'disk' => 'public',
        'path' => $path,
        'status' => 'orphaned',
        'updated_at' => now()->subDays(8),
    ]);

    $recentOrphan = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'disk' => 'public',
        'path' => "uploads/images/workspaces/{$workspace->id}/2026/03/recent.png",
        'status' => 'orphaned',
        'updated_at' => now()->subDays(2),
    ]);

    $this->artisan('notes:prune-images')
        ->assertSuccessful();

    expect(NoteImage::query()->whereKey($oldOrphan->id)->exists())->toBeFalse();
    expect(NoteImage::query()->whereKey($recentOrphan->id)->exists())->toBeTrue();
    Storage::disk('public')->assertMissing($path);
});

test('prune note images supports dry run', function () {
    config()->set('note-images.unattached_grace_hours', 24);

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $image = NoteImage::factory()->create([
        'workspace_id' => $workspace->id,
        'uploaded_by' => $user->id,
        'note_id' => null,
        'status' => 'active',
        'created_at' => now()->subHours(30),
        'updated_at' => now()->subHours(30),
    ]);

    $this->artisan('notes:prune-images --dry-run')
        ->assertSuccessful();

    expect($image->fresh()?->status)->toBe('active');
});
