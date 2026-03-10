<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('documentation landing page renders from markdown', function () {
    $user = User::factory()->create();

    $this
        ->actingAs($user)
        ->get('/docs')
        ->assertInertia(fn (Assert $page) => $page
            ->component('docs/show')
            ->where('page.slug', 'index')
            ->where('page.title', 'Jonril Documentation')
            ->where('locale', 'en')
            ->where('pages.0.slug', 'index'),
        );
});
