<?php

use App\Models\Note;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use Illuminate\Support\Facades\DB;

test('note slug service memoizes workspace slug lookups for notes without loaded workspace relation', function () {
    $workspace = Workspace::factory()->create([
        'name' => 'Acme Workspace',
    ]);

    Note::factory()->count(5)->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
    ]);

    $notes = Note::query()
        ->where('workspace_id', $workspace->id)
        ->get();

    $service = new NoteSlugService;

    DB::flushQueryLog();
    DB::enableQueryLog();

    foreach ($notes as $note) {
        $service->urlFor($note);
    }

    DB::disableQueryLog();

    $workspaceQueries = collect(DB::getQueryLog())
        ->pluck('query')
        ->filter(fn (string $sql): bool => preg_match('/from\\s+[\"`]?workspaces[\"`]?/i', $sql) === 1)
        ->count();

    expect($workspaceQueries)->toBeLessThanOrEqual(1);
});

test('note slug service uses loaded workspace relation without querying workspaces table', function () {
    $workspace = Workspace::factory()->create([
        'name' => 'Loaded Workspace',
    ]);

    Note::factory()->count(3)->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_NOTE,
    ]);

    $notes = Note::query()
        ->where('workspace_id', $workspace->id)
        ->with('workspace:id,slug')
        ->get();

    $service = new NoteSlugService;

    DB::flushQueryLog();
    DB::enableQueryLog();

    foreach ($notes as $note) {
        $service->urlFor($note);
    }

    DB::disableQueryLog();

    $workspaceQueries = collect(DB::getQueryLog())
        ->pluck('query')
        ->filter(fn (string $sql): bool => preg_match('/from\\s+[\"`]?workspaces[\"`]?/i', $sql) === 1)
        ->count();

    expect($workspaceQueries)->toBe(0);
});
