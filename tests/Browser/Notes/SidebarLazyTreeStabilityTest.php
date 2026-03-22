<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

function sidebarContainsNoteLink($page, string $href): bool
{
    $escapedHref = json_encode($href, JSON_THROW_ON_ERROR);
    $result = $page->script(<<<JS
(() => {
    const href = {$escapedHref};
    return Array.from(document.querySelectorAll('[data-slot="sidebar"] a[href]'))
        .some((link) => {
            const linkHref = link.getAttribute('href') ?? '';

            return linkHref === href || linkHref.endsWith(href);
        });
})();
JS);

    return $result === true;
}

it('keeps loaded sidebar child nodes visible after deferred page settling', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $parent = Note::factory()->for($workspace)->create([
        'title' => 'Sidebar Parent Deferred',
    ]);

    $child = Note::factory()->for($workspace)->create([
        'title' => 'Sidebar Child Deferred',
        'parent_id' => $parent->id,
    ]);

    $childUrl = browserScopedNoteUrl($child);

    $page = browserLogin($user);
    $page->script("document.cookie = 'sidebar_state=true; path=/';");

    $page->navigate($childUrl)
        ->assertPathIs($childUrl)
        ->assertSee('Sidebar Child Deferred')
        ->waitForEvent('networkidle')
        ->assertNoJavaScriptErrors();

    expect(sidebarContainsNoteLink($page, $childUrl))->toBeTrue();

    $page->script(<<<'JS'
(() => {
    const end = Date.now() + 1200;
    while (Date.now() < end) {
        // wait to allow deferred prop merges to settle
    }
    return true;
})();
JS);

    expect(sidebarContainsNoteLink($page, $childUrl))->toBeTrue();
    $page->assertNoJavaScriptErrors();
});
