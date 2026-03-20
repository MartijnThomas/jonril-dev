<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use App\Support\Notes\JournalNoteService;

test('journal note service blocks creating new journal note in non-personal workspace by default', function () {
    $user = User::factory()->create();
    $workspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $service = app(JournalNoteService::class);

    expect(fn () => $service->resolveOrCreate(
        $workspace,
        Note::JOURNAL_DAILY,
        '2026-03-20',
        'nl',
    ))->toThrow(\InvalidArgumentException::class);

    expect(Note::query()
        ->where('workspace_id', $workspace->id)
        ->where('type', Note::TYPE_JOURNAL)
        ->count())->toBe(0);
});

test('journal note service allows non-personal workspace journal creation when explicitly enabled', function () {
    $user = User::factory()->create();
    $workspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $service = app(JournalNoteService::class);

    $note = $service->resolveOrCreate(
        $workspace,
        Note::JOURNAL_DAILY,
        '2026-03-20',
        'nl',
        null,
        true,
    );

    expect($note->workspace_id)->toBe($workspace->id);
    expect($note->type)->toBe(Note::TYPE_JOURNAL);
});

test('journal note service still resolves existing non-personal journal notes without override', function () {
    $user = User::factory()->create();
    $workspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $existing = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Vrijdag 20 maart 2026',
        'slug' => 'journal/daily/2026-03-20',
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-20',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => [],
    ]);

    $service = app(JournalNoteService::class);
    $resolved = $service->resolveOrCreate(
        $workspace,
        Note::JOURNAL_DAILY,
        '2026-03-20',
        'nl',
    );

    expect($resolved->id)->toBe($existing->id);
});
