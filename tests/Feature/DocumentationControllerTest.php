<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('documentation landing page renders from markdown', function () {
    $user = User::factory()->create([
        'role' => 'admin',
    ]);

    $this
        ->actingAs($user)
        ->get('/docs')
        ->assertInertia(fn (Assert $page) => $page
            ->component('docs/show')
            ->where('page.slug', 'index')
            ->where('page.title', 'Jonril Documentation')
            ->where('page.tocHtml', fn (mixed $toc): bool => is_string($toc) && str_contains($toc, 'docs-toc'))
            ->where('locale', 'en')
            ->where('pages.0.slug', 'index')
            ->where('pages.0.section', 'General')
            ->where('pages', function (mixed $pages): bool {
                if ($pages instanceof \Illuminate\Support\Collection) {
                    $pages = $pages->values()->all();
                }

                if (! is_array($pages) || $pages === []) {
                    return false;
                }

                $last = $pages[array_key_last($pages)] ?? null;

                return is_array($last)
                    && ($last['section'] ?? null) === 'Development';
            }),
        );
});

test('non-admin users do not see development docs and cannot open them directly', function () {
    $user = User::factory()->create([
        'role' => 'user',
    ]);

    $this
        ->actingAs($user)
        ->get('/docs')
        ->assertInertia(fn (Assert $page) => $page
            ->component('docs/show')
            ->where('pages', function (mixed $pages): bool {
                if ($pages instanceof \Illuminate\Support\Collection) {
                    $pages = $pages->values()->all();
                }

                if (! is_array($pages)) {
                    return false;
                }

                foreach ($pages as $item) {
                    if (
                        is_array($item)
                        && isset($item['slug'])
                        && is_string($item['slug'])
                        && str_starts_with($item['slug'], 'development/')
                    ) {
                        return false;
                    }
                }

                return true;
            }),
        );

    $this
        ->actingAs($user)
        ->get('/docs/development/deferred-props-plan-and-payload-inventory')
        ->assertNotFound();
});

test('shared inertia props include i18n metadata without full translations payload', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);

    $this
        ->actingAs($user)
        ->get('/docs')
        ->assertInertia(fn (Assert $page) => $page
            ->component('docs/show')
            ->where('locale', 'en')
            ->where('i18n.uiVersion', fn (mixed $version): bool => is_string($version) && $version !== '')
            ->missing('translations'),
        );
});
