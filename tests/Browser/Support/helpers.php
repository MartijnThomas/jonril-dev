<?php

use App\Models\Note;
use App\Models\User;
use Pest\Browser\Api\AwaitableWebpage;

function browserLogin(User $user, string $password = 'password'): AwaitableWebpage
{
    return visit('/login')
        ->fill('email', $user->email)
        ->fill('password', $password)
        ->press('Log in')
        ->assertNoJavaScriptErrors();
}

function browserScopedNoteUrl(Note $note): string
{
    $workspaceSlug = (string) optional($note->workspace)->slug;

    if ($workspaceSlug === '') {
        throw new RuntimeException('Note workspace slug is required for browserScopedNoteUrl.');
    }

    return "/w/{$workspaceSlug}/notes/{$note->id}";
}
