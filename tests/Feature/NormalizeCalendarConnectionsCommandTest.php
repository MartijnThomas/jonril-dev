<?php

use App\Models\Calendar;
use App\Models\CalendarConnection;
use App\Models\User;

test('normalize command keeps a single canonical connection per workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $firstConnection = CalendarConnection::query()->create([
        'workspace_id' => $workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.example.com',
        'username' => 'user@example.com',
        'password' => 'secret-a',
    ]);
    $secondConnection = CalendarConnection::query()->create([
        'workspace_id' => $workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.example.com',
        'username' => 'user@example.com',
        'password' => 'secret-b',
    ]);

    Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_connection_id' => $firstConnection->id,
        'name' => 'Home',
        'url' => 'https://caldav.example.com/home/',
    ]);
    Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_connection_id' => $secondConnection->id,
        'name' => 'Work',
        'url' => 'https://caldav.example.com/work/',
    ]);

    $this->artisan('calendars:normalize-connections')
        ->assertSuccessful();

    $remainingConnections = CalendarConnection::query()
        ->where('workspace_id', $workspace->id)
        ->get();
    expect($remainingConnections)->toHaveCount(1);

    $connectionId = $remainingConnections->first()->id;
    expect(
        Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('calendar_connection_id', $connectionId)
            ->count()
    )->toBe(2);
});
test('example', function () {
    $response = $this->get('/');

    $response->assertStatus(200);
});
