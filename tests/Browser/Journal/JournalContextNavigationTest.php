<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

it('keeps the active workspace context when opening a journal page', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $activeWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'name' => 'Browser Workspace Alpha',
    ]);

    $settings = is_array($user->settings) ? $user->settings : [];
    $settings['workspace_id'] = $activeWorkspace->id;
    $user->forceFill(['settings' => $settings])->save();

    $page = browserLogin($user);

    $page->navigate('/journal/2026-03-18')
        ->assertPathIs('/journal/2026-03-18')
        ->assertSee('Browser Workspace Alpha')
        ->assertNoJavaScriptErrors();
});

it('switches workspace context on scoped note navigation and restores journal context on back', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspaceAlpha = Workspace::factory()->create([
        'owner_id' => $user->id,
        'name' => 'Browser Workspace Alpha',
    ]);
    $workspaceBeta = Workspace::factory()->create([
        'owner_id' => $user->id,
        'name' => 'Browser Workspace Beta',
    ]);

    $targetNote = Note::factory()->for($workspaceBeta)->create([
        'title' => 'Context Switch Target Note',
    ]);

    $settings = is_array($user->settings) ? $user->settings : [];
    $settings['workspace_id'] = $workspaceAlpha->id;
    $user->forceFill(['settings' => $settings])->save();

    $page = browserLogin($user);

    $page->navigate('/journal/2026-03-18')
        ->assertPathIs('/journal/2026-03-18')
        ->assertSee('Browser Workspace Alpha')
        ->assertNoJavaScriptErrors()
        ->navigate(browserScopedNoteUrl($targetNote))
        ->assertPathIs(browserScopedNoteUrl($targetNote))
        ->assertSee('Browser Workspace Beta')
        ->assertSee('Context Switch Target Note')
        ->assertNoJavaScriptErrors()
        ->back()
        ->assertPathIs('/journal/2026-03-18')
        ->assertSee('Browser Workspace Alpha')
        ->assertNoJavaScriptErrors();
});
