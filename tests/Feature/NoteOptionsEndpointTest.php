<?php

use App\Models\Note;
use App\Models\User;
use Illuminate\Support\Carbon;

test('move parent options exclude scoped note and descendants', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root',
        'content' => ['type' => 'doc', 'content' => []],
    ]);
    $scoped = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Scoped',
        'parent_id' => $root->id,
        'content' => ['type' => 'doc', 'content' => []],
    ]);
    $descendant = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Descendant',
        'parent_id' => $scoped->id,
        'content' => ['type' => 'doc', 'content' => []],
    ]);
    $sibling = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Sibling',
        'parent_id' => $root->id,
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $response = $this->actingAs($user)->getJson(route('notes.options', [
        'workspace' => $workspace->slug,
        'for' => 'move_parent',
        'note_id' => $scoped->id,
    ]));

    $response->assertOk();

    $ids = collect($response->json('options'))->pluck('id')->all();

    expect($ids)->toContain($root->id, $sibling->id)
        ->not->toContain($scoped->id, $descendant->id);
});

test('workspace linkable options exclude notes already used as meeting parents', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $meetingParent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Meeting parent',
        'content' => ['type' => 'doc', 'content' => []],
    ]);
    $workspace->notes()->create([
        'type' => Note::TYPE_MEETING,
        'title' => 'Meeting child',
        'parent_id' => $meetingParent->id,
        'content' => ['type' => 'doc', 'content' => []],
    ]);
    $normal = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Normal',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $response = $this->actingAs($user)->getJson(route('notes.options', [
        'workspace' => $workspace->slug,
        'for' => 'workspace_linkable',
    ]));

    $response->assertOk();

    $ids = collect($response->json('options'))->pluck('id')->all();

    expect($ids)->toContain($normal->id)
        ->not->toContain($meetingParent->id);
});

test('meeting parent options include today daily journal note', function () {
    Carbon::setTestNow(Carbon::parse('2026-03-22 09:00:00', 'Europe/Amsterdam'));

    try {
        $user = User::factory()->create();
        $workspace = $user->currentWorkspace();

        $journal = $workspace->notes()->create([
            'type' => Note::TYPE_JOURNAL,
            'journal_granularity' => Note::JOURNAL_DAILY,
            'journal_date' => Carbon::now('Europe/Amsterdam')->toDateString(),
            'title' => 'Daily',
            'content' => ['type' => 'doc', 'content' => []],
        ]);

        $response = $this->actingAs($user)->getJson(route('notes.options', [
            'workspace' => $workspace->slug,
            'for' => 'meeting_parent',
        ]));

        $response->assertOk();

        $first = collect($response->json('options'))->first();

        expect($first)->not->toBeNull()
            ->and($first['id'])->toBe($journal->id)
            ->and($first['is_journal'])->toBeTrue();
    } finally {
        Carbon::setTestNow();
    }
});
