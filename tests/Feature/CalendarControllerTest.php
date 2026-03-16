<?php

use App\Jobs\SyncCalendarJob;
use App\Models\Calendar;
use App\Models\User;
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
    Calendar::query()->create([
        'workspace_id' => $this->workspace->id,
        'name' => 'Test Calendar',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/cal/',
        'username' => 'user@example.com',
        'password' => 'secret',
    ]);

    $response = $this->get("/settings/workspaces/{$this->workspace->id}");

    $response->assertInertia(fn (Assert $page) => $page
        ->has('calendars', 1)
        ->has('calendars.0', fn (Assert $cal) => $cal
            ->where('name', 'Test Calendar')
            ->where('provider', 'caldav')
            ->where('username', 'user@example.com')
            ->etc()
        )
    );
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
