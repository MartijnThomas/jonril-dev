<?php

use App\Models\User;
use Illuminate\Support\Facades\Cache;
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

test('shared ui translations are loaded through cache in non-local environments', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);

    Cache::shouldReceive('remember')
        ->once()
        ->withArgs(function (mixed $key, mixed $ttl, mixed $callback): bool {
            return is_string($key)
                && str_starts_with($key, 'i18n:ui:en:')
                && is_callable($callback);
        })
        ->andReturn([
            'cache_test_key' => 'cached-value',
        ]);

    $this
        ->actingAs($user)
        ->get('/docs')
        ->assertInertia(fn (Assert $page) => $page
            ->component('docs/show')
            ->where('locale', 'en')
            ->where('translations.ui.cache_test_key', 'cached-value'),
        );
});

test('shared ui translations bypass cache in local environment', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);

    $this->app->detectEnvironment(fn () => 'local');
    Cache::spy();

    $this
        ->actingAs($user)
        ->get('/docs')
        ->assertInertia(fn (Assert $page) => $page
            ->component('docs/show')
            ->where('locale', 'en')
            ->where('translations.ui.tasks_index.page_title', 'Tasks'),
        );

    Cache::shouldNotHaveReceived('remember');
});
