<?php

use App\Models\Note;
use App\Models\User;

it('renders a scoped note page for an authenticated user', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);
    $workspace = $user->currentWorkspace();

    expect($workspace)->not->toBeNull();

    $note = Note::factory()->for($workspace)->create([
        'title' => 'Browser Note',
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($note))
        ->assertPathIs(browserScopedNoteUrl($note))
        ->assertSee('Browser Note')
        ->assertNoJavaScriptErrors();
});

it('redirects guests away from scoped note pages', function () {
    $note = Note::factory()->create();

    visit(browserScopedNoteUrl($note))
        ->assertPathBeginsWith('/login')
        ->assertSee('Log in');
});
