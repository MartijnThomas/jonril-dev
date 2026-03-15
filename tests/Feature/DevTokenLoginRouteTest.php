<?php

use Illuminate\Support\Facades\Route;

test('dev token login route is not registered in testing environment', function () {
    expect(app()->environment('testing'))->toBeTrue();
    expect(Route::has('dev.auth.token-login'))->toBeFalse();
});

test('dev token login endpoint is not reachable in testing environment', function () {
    $response = $this->get('/dev/auth/token-login?token=invalid-token&redirect=/notes/list');

    $response->assertNotFound();
});
