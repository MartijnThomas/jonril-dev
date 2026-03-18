<?php

use App\Jobs\WarmNoteSharedCacheJob;
use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;

it('warms all four cache keys for a workspace', function () {
    $user = User::factory()->create();
    $workspace = Workspace::factory()->create();
    $workspace->users()->attach($user, ['role' => 'owner']);

    Note::factory()->for($workspace)->create(['title' => 'Alpha', 'type' => Note::TYPE_NOTE]);
    Note::factory()->for($workspace)->create(['title' => 'Beta', 'type' => Note::TYPE_NOTE]);
    Note::factory()->for($workspace)->create(['title' => 'Journal note', 'type' => Note::TYPE_JOURNAL]);

    $treeKey = "notes_tree_{$workspace->id}";
    $countKey = "notes_count_{$workspace->id}";
    $linkableKey = "notes_dropdown_linkable_{$workspace->id}";
    $parentsKey = "notes_dropdown_parents_{$workspace->id}";

    Cache::forget($treeKey);
    Cache::forget($countKey);
    Cache::forget($linkableKey);
    Cache::forget($parentsKey);

    (new WarmNoteSharedCacheJob($workspace->id))->handle(
        app(\App\Support\Notes\NoteSlugService::class),
    );

    expect(Cache::has($treeKey))->toBeTrue();
    expect(Cache::has($countKey))->toBeTrue();
    expect(Cache::has($linkableKey))->toBeTrue();
    expect(Cache::has($parentsKey))->toBeTrue();
});

it('populates note count with correct totals', function () {
    $workspace = Workspace::factory()->create();
    Note::factory()->for($workspace)->count(3)->create(['type' => Note::TYPE_NOTE]);
    Note::factory()->for($workspace)->count(2)->create(['type' => Note::TYPE_JOURNAL]);

    (new WarmNoteSharedCacheJob($workspace->id))->handle(
        app(\App\Support\Notes\NoteSlugService::class),
    );

    $counts = Cache::get("notes_count_{$workspace->id}");
    expect($counts['total'])->toBe(5);
    expect($counts['journal'])->toBe(2);
    expect($counts['normal'])->toBe(3);
});

it('populates notes tree excluding journal and meeting notes', function () {
    $workspace = Workspace::factory()->create();
    Note::factory()->for($workspace)->create(['title' => 'Regular', 'type' => Note::TYPE_NOTE]);
    Note::factory()->for($workspace)->create(['title' => 'Meeting', 'type' => Note::TYPE_MEETING]);
    Note::factory()->for($workspace)->create(['title' => 'Journal', 'type' => Note::TYPE_JOURNAL]);

    (new WarmNoteSharedCacheJob($workspace->id))->handle(
        app(\App\Support\Notes\NoteSlugService::class),
    );

    $tree = Cache::get("notes_tree_{$workspace->id}");
    $titles = array_column($tree, 'title');
    expect($titles)->toContain('Regular');
    expect($titles)->not->toContain('Meeting');
    expect($titles)->not->toContain('Journal');
});

it('silently exits when workspace does not exist', function () {
    $job = new WarmNoteSharedCacheJob('non-existent-id');

    expect(fn () => $job->handle(app(\App\Support\Notes\NoteSlugService::class)))->not->toThrow(Exception::class);
});

it('is dispatched when note shared cache is cleared', function () {
    Queue::fake();

    $workspace = Workspace::factory()->create();
    $user = User::factory()->create();
    $workspace->users()->attach($user, ['role' => 'owner']);

    $note = Note::factory()->for($workspace)->create(['title' => 'Original']);

    Queue::assertPushed(WarmNoteSharedCacheJob::class, fn ($job) => $job->workspaceId === $workspace->id);
});

it('is dispatched on note delete', function () {
    Queue::fake();

    $workspace = Workspace::factory()->create();
    $note = Note::factory()->for($workspace)->create();

    $note->delete();

    Queue::assertPushed(WarmNoteSharedCacheJob::class, fn ($job) => $job->workspaceId === $workspace->id);
});
