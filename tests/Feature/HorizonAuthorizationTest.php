<?php

use App\Models\User;
use Illuminate\Support\Facades\Gate;

test('horizon gate allows martijn email', function () {
    $user = User::factory()->create([
        'email' => 'martijn@mthomas.nl',
    ]);

    expect(Gate::forUser($user)->allows('viewHorizon'))->toBeTrue();
});

test('horizon gate denies other emails', function () {
    $user = User::factory()->create();

    expect(Gate::forUser($user)->allows('viewHorizon'))->toBeFalse();
});
