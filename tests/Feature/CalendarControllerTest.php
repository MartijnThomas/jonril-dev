<?php

use App\Jobs\SyncCalendarJob;
use App\Models\Calendar;
use App\Models\CalendarConnection;
use App\Models\User;
use App\Models\Workspace;
use App\Services\CalDavService;
use Illuminate\Support\Facades\Bus;
use Inertia\Testing\AssertableInertia as Assert;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->workspace = $this->user->currentWorkspace();
    $this->actingAs($this->user);
});

test('non-owner cannot connect a calendar', function () {
    $other = User::factory()->create();
    $workspace = $other->currentWorkspace();

    $response = $this->post("/settings/workspaces/{$workspace->id}/calendars", [
        'name' => 'My Cal',
        'url' => 'https://caldav.example.com/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $response->assertStatus(403);
    expect(Calendar::query()->where('workspace_id', $workspace->id)->count())->toBe(0);
});

test('owner cannot connect a calendar in non-personal workspace', function () {
    $workspace = Workspace::factory()->create([
        'owner_id' => $this->user->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $this->user->id => ['role' => 'owner'],
    ]);

    $response = $this->post("/settings/workspaces/{$workspace->id}/calendars", [
        'name' => 'Team Calendar',
        'url' => 'https://caldav.example.com/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $response->assertStatus(409);
    expect(Calendar::query()->where('workspace_id', $workspace->id)->count())->toBe(0);
});

test('owner can connect and discovers multiple calendars', function () {
    Bus::fake();

    $mock = Mockery::mock(CalDavService::class);
    $mock->shouldReceive('testConnection')->once()->andReturn(true);
    $mock->shouldReceive('discoverCalendars')
        ->once()
        ->andReturn([
            ['name' => 'Home', 'url' => 'https://caldav.example.com/home/', 'color' => '#ff0000'],
            ['name' => 'Work', 'url' => 'https://caldav.example.com/work/', 'color' => null],
        ]);
    app()->instance(CalDavService::class, $mock);

    $response = $this->post("/settings/workspaces/{$this->workspace->id}/calendars", [
        'name' => 'My iCloud',
        'url' => 'https://caldav.example.com/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-connected');

    $calendars = Calendar::query()->where('workspace_id', $this->workspace->id)->get();
    expect($calendars)->toHaveCount(2);
    expect($calendars->pluck('name')->toArray())->toContain('Home', 'Work');
    expect($calendars->first()->color)->toBe('#ff0000');
    expect($calendars->pluck('calendar_connection_id')->filter()->unique()->count())->toBe(1);
    expect($calendars->every(fn (Calendar $calendar): bool => $calendar->is_active === false))->toBeTrue();

    Bus::assertDispatched(SyncCalendarJob::class, 2);
});

test('falls back to single calendar when discovery returns nothing', function () {
    Bus::fake();

    $mock = Mockery::mock(CalDavService::class);
    $mock->shouldReceive('testConnection')->once()->andReturn(true);
    $mock->shouldReceive('discoverCalendars')->once()->andReturn([]);
    app()->instance(CalDavService::class, $mock);

    $response = $this->post("/settings/workspaces/{$this->workspace->id}/calendars", [
        'name' => 'My Cal',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $response->assertRedirect();

    $calendars = Calendar::query()->where('workspace_id', $this->workspace->id)->get();
    expect($calendars)->toHaveCount(1);
    expect($calendars->first()->name)->toBe('My Cal');
    expect($calendars->first()->url)->toBe('https://caldav.example.com/cal/');
    expect($calendars->first()->is_active)->toBeFalse();

    Bus::assertDispatched(SyncCalendarJob::class, 1);
});

test('connect returns error when connection test fails', function () {
    $mock = Mockery::mock(CalDavService::class);
    $mock->shouldReceive('testConnection')->once()->andReturn(false);
    app()->instance(CalDavService::class, $mock);

    $response = $this->post("/settings/workspaces/{$this->workspace->id}/calendars", [
        'name' => 'Bad Cal',
        'url' => 'https://caldav.example.com/',
        'username' => 'user@example.com',
        'password' => 'wrong',
    ]);

    $response->assertRedirect();
    $response->assertSessionHasErrors('calendar');
    expect(Calendar::query()->where('workspace_id', $this->workspace->id)->count())->toBe(0);
});

test('connect validates required fields', function () {
    $response = $this->post("/settings/workspaces/{$this->workspace->id}/calendars", []);

    $response->assertSessionHasErrors(['name', 'url', 'username', 'password']);
});

test('owner can toggle calendar active state', function () {
    $calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'My Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $response = $this->patch("/settings/workspaces/{$this->workspace->id}/calendars/{$calendar->id}", [
        'is_active' => false,
    ]);

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-updated');
    expect($calendar->fresh()->is_active)->toBeFalse();

    $this->patch("/settings/workspaces/{$this->workspace->id}/calendars/{$calendar->id}", [
        'is_active' => true,
    ]);
    expect($calendar->fresh()->is_active)->toBeTrue();
});

test('deactivating a calendar clears outbound timeblock target preference', function () {
    $calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'My Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $settings = is_array($this->user->settings) ? $this->user->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $this->user->forceFill(['settings' => $settings])->save();

    $this->patch("/settings/workspaces/{$this->workspace->id}/calendars/{$calendar->id}", [
        'is_active' => false,
    ])->assertRedirect();

    expect(data_get($this->user->fresh()->settings, 'calendar.outbound_timeblock_calendar_id'))->toBeNull();
});

test('non-owner cannot toggle calendar active state', function () {
    $other = User::factory()->create();
    $calendar = Calendar::query()->create([
        'workspace_id' => $other->currentWorkspace()->id,
        'name' => 'Other Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'other@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $response = $this->patch("/settings/workspaces/{$other->currentWorkspace()->id}/calendars/{$calendar->id}", [
        'is_active' => false,
    ]);

    $response->assertStatus(403);
    expect($calendar->fresh()->is_active)->toBeTrue();
});

test('owner can disconnect a calendar', function () {
    $calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'My Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $response = $this->delete("/settings/workspaces/{$this->workspace->id}/calendars/{$calendar->id}");

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-disconnected');
    expect(Calendar::query()->find($calendar->id))->toBeNull();
});

test('owner can sync all calendars in one connection', function () {
    Bus::fake();

    $primaryConnection = CalendarConnection::query()->create([
        'workspace_id' => $this->workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.example.com',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);
    $otherConnection = CalendarConnection::query()->create([
        'workspace_id' => $this->workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.example.com',
        'username' => 'other@example.com',
        'password' => 'secret',
    ]);

    collect([
        Calendar::query()->create([
            'workspace_id' => $this->workspace->id,
            'calendar_connection_id' => $primaryConnection->id,
            'name' => 'Home',
            'provider' => 'caldav',
            'url' => 'https://caldav.example.com/home/',
            'username' => 'user@example.com',
            'password' => 'secret',
        ]),
        Calendar::query()->create([
            'workspace_id' => $this->workspace->id,
            'calendar_connection_id' => $primaryConnection->id,
            'name' => 'Work',
            'provider' => 'caldav',
            'url' => 'https://caldav.example.com/work/',
            'username' => 'user@example.com',
            'password' => 'secret',
        ]),
    ]);

    Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $otherConnection->id,
        'name' => 'Other',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/other/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $mock = Mockery::mock(CalDavService::class);
    $mock->shouldReceive('discoverCalendars')
        ->atLeast()->times(1)
        ->andReturn([
            ['name' => 'Home', 'url' => 'https://caldav.example.com/home/', 'color' => '#ff0000'],
            ['name' => 'Newly Added', 'url' => 'https://caldav.example.com/new/', 'color' => null],
        ]);
    app()->instance(CalDavService::class, $mock);

    $response = $this->post("/settings/workspaces/{$this->workspace->id}/calendars/connections/{$primaryConnection->id}/sync");

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-connection-synced');

    Bus::assertNotDispatched(SyncCalendarJob::class);
    expect(Calendar::query()->where('workspace_id', $this->workspace->id)->where('name', 'Newly Added')->exists())->toBeTrue();
    expect(Calendar::query()->where('workspace_id', $this->workspace->id)->where('name', 'Work')->exists())->toBeFalse();
    expect(Calendar::query()->where('workspace_id', $this->workspace->id)->where('name', 'Other')->exists())->toBeTrue();
});

test('owner can sync calendars grouped by connection id', function () {
    Bus::fake();

    $connection = CalendarConnection::query()->create([
        'workspace_id' => $this->workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.icloud.com/123/calendars',
        'username' => 'martijn.thomas@icloud.com',
        'password' => 'secret',
    ]);

    $first = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'First',
        'provider' => 'caldav',
        'url' => 'https://caldav.icloud.com/123/calendars/a/',
        'username' => 'martijn.thomas@icloud.com',
        'password' => 'secret',
    ]);

    Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Second',
        'provider' => 'caldav',
        'url' => 'https://caldav.icloud.com/123/calendars/b/',
        'username' => 'martijn.thomas@icloud.com',
        'password' => 'secret',
    ]);

    $mock = Mockery::mock(CalDavService::class);
    $mock->shouldReceive('discoverCalendars')
        ->atLeast()->times(1)
        ->andReturn([
            ['name' => 'First', 'url' => 'https://caldav.icloud.com/123/calendars/a/', 'color' => null],
            ['name' => 'Second', 'url' => 'https://caldav.icloud.com/123/calendars/b/', 'color' => null],
            ['name' => 'Third', 'url' => 'https://caldav.icloud.com/123/calendars/c/', 'color' => null],
        ]);
    app()->instance(CalDavService::class, $mock);

    $response = $this->post("/settings/workspaces/{$this->workspace->id}/calendars/connections/{$connection->id}/sync");

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-connection-synced');
    Bus::assertNotDispatched(SyncCalendarJob::class);
    expect(Calendar::query()->where('workspace_id', $this->workspace->id)->where('name', 'Third')->exists())->toBeTrue();
});

test('connection sync retries discovery using fallback URLs and uses best non-empty result', function () {
    Bus::fake();

    $connection = CalendarConnection::query()->create([
        'workspace_id' => $this->workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.icloud.com/123/calendars',
        'username' => 'martijn.thomas@icloud.com',
        'password' => 'secret',
    ]);

    $calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Primary',
        'provider' => 'caldav',
        'url' => 'https://caldav.icloud.com/123/calendars/timeblocks/',
        'username' => 'martijn.thomas@icloud.com',
        'password' => 'secret',
    ]);

    $mock = Mockery::mock(CalDavService::class);
    $callCount = 0;
    $mock->shouldReceive('discoverCalendars')
        ->atLeast()->times(3)
        ->andReturnUsing(function () use (&$callCount): array {
            $callCount++;

            if ($callCount < 3) {
                return [];
            }

            return [
                ['name' => 'Timeblocks', 'url' => 'https://caldav.icloud.com/123/calendars/timeblocks/', 'color' => '#1d4ed8'],
                ['name' => 'Work', 'url' => 'https://caldav.icloud.com/123/calendars/work/', 'color' => '#16a34a'],
            ];
        });
    app()->instance(CalDavService::class, $mock);

    $response = $this->post("/settings/workspaces/{$this->workspace->id}/calendars/connections/{$connection->id}/sync");

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-connection-synced');
    Bus::assertNotDispatched(SyncCalendarJob::class);
    expect(Calendar::query()->where('workspace_id', $this->workspace->id)->where('name', 'Work')->exists())->toBeTrue();
});

test('owner can update password for all calendars in one connection', function () {
    $connection = CalendarConnection::query()->create([
        'workspace_id' => $this->workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.example.com',
        'username' => 'user@example.com',
        'password' => 'old-secret',
    ]);

    $first = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Home',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/home/',
        'username' => 'user@example.com',
        'password' => 'old-secret',
    ]);
    $second = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Work',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/work/',
        'username' => 'user@example.com',
        'password' => 'old-secret',
    ]);

    $response = $this->patch("/settings/workspaces/{$this->workspace->id}/calendars/connections/{$connection->id}/password", [
        'password' => 'new-secret',
    ]);

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-connection-password-updated');

    expect($connection->fresh()->password)->toBe('new-secret');
    expect($first->fresh()->sync_token)->toBeNull();
    expect($second->fresh()->sync_token)->toBeNull();
});

test('owner can disconnect all calendars in one connection and clears outbound target', function () {
    $connection = CalendarConnection::query()->create([
        'workspace_id' => $this->workspace->id,
        'provider' => 'caldav',
        'server_url' => 'https://caldav.example.com',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $first = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Home',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/home/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);
    Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Work',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/work/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $settings = is_array($this->user->settings) ? $this->user->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $first->id);
    $this->user->forceFill(['settings' => $settings])->save();

    $response = $this->delete("/settings/workspaces/{$this->workspace->id}/calendars/connections/{$connection->id}");

    $response->assertRedirect();
    $response->assertSessionHas('status', 'calendar-connection-disconnected');
    expect(Calendar::query()->where('workspace_id', $this->workspace->id)->count())->toBe(0);
    expect(data_get($this->user->fresh()->settings, 'calendar.outbound_timeblock_calendar_id'))->toBeNull();
});

test('disconnecting a calendar clears outbound timeblock target preference', function () {
    $calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'My Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $settings = is_array($this->user->settings) ? $this->user->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $this->user->forceFill(['settings' => $settings])->save();

    $this->delete("/settings/workspaces/{$this->workspace->id}/calendars/{$calendar->id}")
        ->assertRedirect();

    expect(data_get($this->user->fresh()->settings, 'calendar.outbound_timeblock_calendar_id'))->toBeNull();
});

test('cannot disconnect a calendar belonging to another workspace', function () {
    $other = User::factory()->create();
    $otherWorkspace = $other->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $otherWorkspace->id,
        'name' => 'Other Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'other@example.com',
        'password' => 'secret',
    ]);

    $response = $this->delete("/settings/workspaces/{$this->workspace->id}/calendars/{$calendar->id}");

    $response->assertStatus(404);
    expect(Calendar::query()->find($calendar->id))->not()->toBeNull();
});

test('workspace settings page includes calendars prop', function () {
    $calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'Test Calendar',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $settings = is_array($this->user->settings) ? $this->user->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $this->user->forceFill(['settings' => $settings])->save();

    $response = $this->get("/settings/workspaces/{$this->workspace->id}");

    $response->assertInertia(fn (Assert $page) => $page
        ->where('timeblockSyncTargetCalendarId', $calendar->id)
        ->has('calendars', 1)
        ->has('calendars.0', fn (Assert $cal) => $cal
            ->where('name', 'Test Calendar')
            ->where('provider', 'caldav')
            ->where('username', 'user@example.com')
            ->etc()
        )
    );
});

test('workspace member can refresh all active calendars', function () {
    Bus::fake();

    Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'Active Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/active/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'Inactive Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/inactive/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => false,
    ]);

    $response = $this->postJson("/w/{$this->workspace->slug}/calendar/refresh");

    $response->assertOk()->assertJson(['ok' => true]);
    Bus::assertDispatchedTimes(SyncCalendarJob::class, 1);
});

test('calendar refresh is blocked for non-personal workspace', function () {
    $workspace = Workspace::factory()->create([
        'owner_id' => $this->user->id,
        'is_personal' => false,
    ]);
    $workspace->users()->syncWithoutDetaching([
        $this->user->id => ['role' => 'owner'],
    ]);

    $response = $this->postJson("/w/{$workspace->slug}/calendar/refresh");

    $response->assertStatus(409);
});

test('non-member cannot refresh calendars', function () {
    $other = User::factory()->create();

    $response = $this->actingAs($other)->postJson("/w/{$this->workspace->slug}/calendar/refresh");

    $response->assertStatus(403);
});

test('refresh with no active calendars returns ok without dispatching jobs', function () {
    Bus::fake();

    $response = $this->postJson("/w/{$this->workspace->slug}/calendar/refresh");

    $response->assertOk()->assertJson(['ok' => true]);
    Bus::assertNothingDispatched();
});

test('sync job is dispatched on login for user calendars', function () {
    Bus::fake();

    $calendar = Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'My Cal',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    event(new \Illuminate\Auth\Events\Login('web', $this->user, false));

    Bus::assertDispatched(SyncCalendarJob::class, fn ($job) => $job->calendar->id === $calendar->id);
});
