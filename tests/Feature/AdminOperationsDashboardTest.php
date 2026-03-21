<?php

use App\Models\Calendar;
use App\Models\CalendarConnection;
use App\Models\NoteImage;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Support\System\ScheduledCommandHealthStore;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;

test('admin can view operations dashboard with metrics', function (): void {
    Storage::fake('backups');

    config()->set('backup.backup.name', 'app-full');
    config()->set('backup.backup.destination.disks', ['backups']);
    config()->set('backup_hourly_db.backup.name', 'app-hourly-db');
    config()->set('backup_hourly_db.backup.destination.disks', ['backups']);

    Storage::disk('backups')->put('app-full/2026-03-21-06-00-00.zip', 'full-backup');
    Storage::disk('backups')->put('app-hourly-db/2026-03-21-09-15-00.zip', 'hourly-db-backup');

    ScheduledCommandHealthStore::markSuccess('backup_run_full', [
        'label' => 'Backup run (full)',
        'command' => 'backup:run',
        'expression' => '0 6 * * *',
        'timezone' => 'Europe/Amsterdam',
        'output' => 'Backup completed.',
    ]);

    $admin = User::factory()->create(['role' => 'admin']);
    $workspace = $admin->currentWorkspace();

    $connection = CalendarConnection::query()->create([
        'workspace_id' => $workspace?->id,
        'provider' => 'caldav',
        'server_url' => 'https://cal.example.test/users/admin',
        'username' => 'admin@example.test',
        'password' => 'secret',
    ]);

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace?->id,
        'calendar_connection_id' => $connection->id,
        'name' => 'Timeblocks',
        'url' => 'https://cal.example.test/users/admin/timeblocks',
        'is_active' => true,
        'last_synced_at' => now(),
    ]);

    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace?->id,
        'calendar_id' => $calendar->id,
        'note_id' => (string) Str::uuid(),
        'event_id' => (string) Str::uuid(),
        'timeblock_id' => (string) Str::uuid(),
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_CREATE,
    ]);

    NoteImage::factory()->create([
        'workspace_id' => $workspace?->id,
        'status' => 'active',
        'size_bytes' => 2048,
    ]);

    NoteImage::factory()->create([
        'workspace_id' => $workspace?->id,
        'status' => 'orphaned',
        'size_bytes' => 1024,
    ]);

    $this
        ->actingAs($admin)
        ->get(route('settings.admin.operations', absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->component('settings/admin-operations')
            ->has('backupProfiles', 2)
            ->has('scheduledHealth')
            ->where('timeblockSyncMetrics.pending', 1)
            ->where('calendarMetrics.total', 1)
            ->where('noteImageMetrics.total', 2)
            ->where('noteImageMetrics.total_size_bytes', 3072)
            ->where('telescopeMetrics.enabled', true));
});

test('non admin cannot view operations dashboard', function (): void {
    $user = User::factory()->create(['role' => 'user']);

    $this
        ->actingAs($user)
        ->get(route('settings.admin.operations', absolute: false))
        ->assertForbidden();
});

test('scheduled command health states are derived correctly', function (): void {
    config()->set('system-health.scheduled_commands', [
        'healthy_command' => [
            'label' => 'Healthy',
            'command' => 'healthy:run',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 60,
        ],
        'stale_command' => [
            'label' => 'Stale',
            'command' => 'stale:run',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 60,
        ],
        'failed_command' => [
            'label' => 'Failed',
            'command' => 'failed:run',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 60,
        ],
        'running_command' => [
            'label' => 'Running',
            'command' => 'running:run',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 60,
        ],
        'unknown_command' => [
            'label' => 'Unknown',
            'command' => 'unknown:run',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 60,
        ],
    ]);

    ScheduledCommandHealthStore::markSuccess('healthy_command', [
        'label' => 'Healthy',
        'command' => 'healthy:run',
        'expression' => '* * * * *',
        'timezone' => 'Europe/Amsterdam',
        'output' => 'ok',
    ]);
    ScheduledCommandHealthStore::markFailure('failed_command', [
        'label' => 'Failed',
        'command' => 'failed:run',
        'expression' => '* * * * *',
        'timezone' => 'Europe/Amsterdam',
        'output' => 'failed',
    ]);
    ScheduledCommandHealthStore::markStarted('running_command', [
        'label' => 'Running',
        'command' => 'running:run',
        'expression' => '* * * * *',
        'timezone' => 'Europe/Amsterdam',
    ]);

    Cache::forever('system:scheduled-command-health:stale_command', [
        'key' => 'stale_command',
        'command' => 'stale:run',
        'label' => 'Stale',
        'expression' => '* * * * *',
        'timezone' => 'Europe/Amsterdam',
        'last_status' => 'success',
        'last_success_at' => CarbonImmutable::now()->subHours(3)->toIso8601String(),
        'last_finished_at' => CarbonImmutable::now()->subHours(3)->toIso8601String(),
    ]);

    $admin = User::factory()->create(['role' => 'admin']);

    $this
        ->actingAs($admin)
        ->get(route('settings.admin.operations', absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->where('scheduledHealth', function ($items): bool {
                $states = collect($items)->mapWithKeys(
                    fn (array $item): array => [(string) $item['key'] => (string) $item['health_state']]
                );

                return $states->get('healthy_command') === 'healthy'
                    && $states->get('stale_command') === 'stale'
                    && $states->get('failed_command') === 'failed'
                    && $states->get('running_command') === 'running'
                    && $states->get('unknown_command') === 'unknown';
            }));
});

test('backup profile health states are derived correctly', function (): void {
    Storage::fake('backups');

    config()->set('backup.backup.name', 'health-full');
    config()->set('backup.backup.destination.disks', ['backups']);
    config()->set('backup_hourly_db.backup.name', 'health-hourly');
    config()->set('backup_hourly_db.backup.destination.disks', ['backups']);

    $recent = CarbonImmutable::now()->subMinutes(30)->format('Y-m-d-H-i-s');
    $old = CarbonImmutable::now()->subHours(5)->format('Y-m-d-H-i-s');

    Storage::disk('backups')->put("health-full/{$recent}.zip", 'recent');
    Storage::disk('backups')->put("health-hourly/{$old}.zip", 'old');

    config()->set('system-health.backup_profiles', [
        'healthy' => [
            'label' => 'Healthy backup',
            'config' => 'backup',
            'stale_after_minutes' => 120,
        ],
        'stale' => [
            'label' => 'Stale backup',
            'config' => 'backup_hourly_db',
            'stale_after_minutes' => 120,
        ],
        'error' => [
            'label' => 'Error backup',
            'config' => 'missing_backup_config',
            'stale_after_minutes' => 120,
        ],
    ]);

    $admin = User::factory()->create(['role' => 'admin']);

    $this
        ->actingAs($admin)
        ->get(route('settings.admin.operations', absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->where('backupProfiles', function ($profiles): bool {
                $states = collect($profiles)->mapWithKeys(
                    fn (array $profile): array => [(string) $profile['key'] => (string) $profile['health_state']]
                );

                return $states->get('healthy') === 'healthy'
                    && $states->get('stale') === 'stale'
                    && $states->get('error') === 'error';
            }));
});
