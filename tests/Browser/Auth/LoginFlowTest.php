<?php

use App\Models\User;

it('redirects guests to login for authenticated pages', function () {
    visit('/notes/list')
        ->assertPathBeginsWith('/login')
        ->assertSee('Log in');

    visit('/journal')
        ->assertPathBeginsWith('/login')
        ->assertSee('Log in');
});

it('logs in with valid credentials and can open notes list', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $page = browserLogin($user);

    $page->navigate('/notes/list')
        ->assertPathIs('/notes/list')
        ->assertNoJavaScriptErrors();

    $this->assertAuthenticatedAs($user);
});
