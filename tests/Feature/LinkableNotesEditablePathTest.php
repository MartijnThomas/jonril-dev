<?php

use App\Models\Note;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('linkable notes expose full editable paths for regular and journal notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not->toBeNull();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project',
    ]);

    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Roadmap',
        'parent_id' => $parent->id,
    ]);

    $journal = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Wednesday 18 March 2026',
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-18',
    ]);

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target',
    ]);

    $this
        ->actingAs($user)
        ->get("/w/{$workspace->slug}/notes/{$target->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->where('linkableNotes', function ($linkableNotes) use ($child, $journal): bool {
                $items = collect($linkableNotes);

                $childMatch = $items->first(
                    fn (array $item): bool => ($item['id'] ?? null) === $child->id,
                );
                $journalMatch = $items->first(
                    fn (array $item): bool => ($item['id'] ?? null) === $journal->id,
                );

                if (! is_array($childMatch) || ! is_array($journalMatch)) {
                    return false;
                }

                $journalEditablePath = (string) ($journalMatch['editablePath'] ?? '');

                return ($childMatch['editablePath'] ?? null) === 'Project / Roadmap'
                    && $journalEditablePath !== ''
                    && str_contains($journalEditablePath, '>')
                    && ! str_contains($journalEditablePath, '-');
            }),
        );
});
