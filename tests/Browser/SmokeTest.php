<?php

use App\Models\User;

it('renders the welcome page without javascript errors', function () {
    $page = visit('/');

    $page->assertSee('Log in')
        ->assertNoJavaScriptErrors();
});

it('renders the login page without javascript errors', function () {
    $page = visit('/login');

    $page->assertSee('Log in')
        ->assertNoJavaScriptErrors();
});

it('can log in and reach the notes index', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $page = visit('/login');

    $page->fill('email', $user->email)
        ->fill('password', 'password')
        ->press('Log in')
        ->assertNoJavaScriptErrors();

    $this->assertAuthenticated();
});
