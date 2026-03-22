<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

it('wraps meeting participants row instead of overflowing viewport', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $note = Note::factory()->for($workspace)->create([
        'type' => Note::TYPE_MEETING,
        'title' => 'Participants layout test',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Meeting content'],
                    ],
                ],
            ],
        ],
        'properties' => [
            'participants' => 'alexandria, benjamin, catherine, dominique, emmanuel',
        ],
        'meta' => [
            'starts_at' => '2026-03-22T10:00:00+01:00',
            'ends_at' => '2026-03-22T10:45:00+01:00',
            'timezone' => 'Europe/Amsterdam',
            'location' => 'Room Alpha',
        ],
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($note))
        ->assertPathIs(browserScopedNoteUrl($note))
        ->assertNoJavaScriptErrors();

    $layout = $page->script(<<<'JS'
(() => {
    const row = document.querySelector('[data-testid="meeting-participants-row"]');
    if (!(row instanceof HTMLElement)) {
        return null;
    }

    row.style.width = '180px';
    row.style.maxWidth = '180px';

    const styles = window.getComputedStyle(row);

    return {
        flexWrap: styles.flexWrap,
        overflows: row.scrollWidth > row.clientWidth + 1,
    };
})();
JS);

    expect($layout)->toBeArray();
    expect($layout['flexWrap'] ?? null)->toBe('wrap');
    expect($layout['overflows'] ?? true)->toBeFalse();
});
