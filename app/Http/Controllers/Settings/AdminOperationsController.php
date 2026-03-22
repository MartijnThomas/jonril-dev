<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Models\Calendar;
use App\Models\NoteImage;
use App\Models\TimeblockCalendarLink;
use App\Models\WorkspaceDailyIndicator;
use App\Models\WorkspaceDailySignal;
use App\Support\System\ScheduledCommandHealthStore;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Inertia\Inertia;
use Inertia\Response;
use Spatie\Backup\BackupDestination\BackupDestination;
use Spatie\Backup\BackupDestination\BackupDestinationFactory;
use Spatie\Backup\Config\Config as BackupConfig;

class AdminOperationsController extends Controller
{
    public function show(Request $request): Response
    {
        $this->assertAdmin($request);

        return Inertia::render('settings/admin-operations', [
            'scheduledHealth' => Inertia::defer(
                fn (): array => $this->scheduledHealth(),
                'operations-scheduled',
            ),
            'backupProfiles' => Inertia::defer(
                fn (): array => $this->backupProfiles(),
                'operations-backups',
            ),
            'timeblockSyncMetrics' => Inertia::defer(
                fn (): array => $this->timeblockSyncMetrics(),
                'operations-metrics',
            ),
            'calendarMetrics' => Inertia::defer(
                fn (): array => $this->calendarMetrics(),
                'operations-metrics',
            ),
            'noteImageMetrics' => Inertia::defer(
                fn (): array => $this->noteImageMetrics(),
                'operations-metrics',
            ),
            'telescopeMetrics' => Inertia::defer(
                fn (): array => $this->telescopeMetrics(),
                'operations-metrics',
            ),
            'dailySignalMetrics' => Inertia::defer(
                fn (): array => $this->dailySignalMetrics(),
                'operations-metrics',
            ),
        ]);
    }

    /**
     * @return array<int, array{
     *     key: string,
     *     label: string,
     *     command: string,
     *     timezone: string,
     *     health_state: string,
     *     stale_after_minutes: int,
     *     last_status: string,
     *     last_started_at: string|null,
     *     last_finished_at: string|null,
     *     last_success_at: string|null,
     *     last_failure_at: string|null,
     *     last_duration_seconds: int|float|null,
     *     last_output: string|null
     * }>
     */
    private function scheduledHealth(): array
    {
        $scheduledDefinitions = collect(config('system-health.scheduled_commands', []))
            ->filter(fn ($item): bool => is_array($item))
            ->all();

        return collect($scheduledDefinitions)
            ->map(function (array $definition, string $key): array {
                $state = ScheduledCommandHealthStore::get($key);
                $staleAfterMinutes = max(1, (int) ($definition['stale_after_minutes'] ?? 60));
                $healthState = $this->resolveScheduledHealthState(
                    status: (string) ($state['last_status'] ?? 'unknown'),
                    lastSuccessAt: $state['last_success_at'] ?? null,
                    staleAfterMinutes: $staleAfterMinutes,
                );

                return [
                    'key' => $key,
                    'label' => (string) ($definition['label'] ?? $key),
                    'command' => (string) ($definition['command'] ?? ''),
                    'timezone' => (string) ($definition['timezone'] ?? config('app.timezone', 'UTC')),
                    'health_state' => $healthState,
                    'stale_after_minutes' => $staleAfterMinutes,
                    'last_status' => (string) ($state['last_status'] ?? 'unknown'),
                    'last_started_at' => $state['last_started_at'] ?? null,
                    'last_finished_at' => $state['last_finished_at'] ?? null,
                    'last_success_at' => $state['last_success_at'] ?? null,
                    'last_failure_at' => $state['last_failure_at'] ?? null,
                    'last_duration_seconds' => $state['last_duration_seconds'] ?? null,
                    'last_output' => $state['last_output'] ?? null,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function backupProfiles(): array
    {
        return collect(config('system-health.backup_profiles', []))
            ->filter(fn ($item): bool => is_array($item))
            ->map(function (array $profile, string $key): array {
                $configKey = (string) ($profile['config'] ?? 'backup');
                $profileConfig = config($configKey);
                $label = (string) ($profile['label'] ?? $key);
                $commandKey = (string) ($profile['command_key'] ?? '');
                $staleAfterMinutes = max(1, (int) ($profile['stale_after_minutes'] ?? 120));

                if (! is_array($profileConfig)) {
                    return [
                        'key' => $key,
                        'label' => $label,
                        'config' => $configKey,
                        'error' => "Missing config key [{$configKey}]",
                        'destinations' => [],
                        'latest_backup_at' => null,
                        'latest_backup_size_bytes' => null,
                        'total_backups' => 0,
                        'total_size_bytes' => 0,
                        'health_state' => 'error',
                        'stale_after_minutes' => $staleAfterMinutes,
                        'tracked_command_key' => $commandKey !== '' ? $commandKey : null,
                    ];
                }

                $destinations = BackupDestinationFactory::createFromArray(
                    BackupConfig::fromArray($profileConfig)
                );

                $mappedDestinations = $destinations
                    ->map(function (BackupDestination $destination): array {
                        $backups = $destination->backups();
                        $newest = $destination->newestBackup();
                        $oldest = $destination->oldestBackup();
                        $recentBackups = $backups
                            ->take(20)
                            ->map(fn ($backup): array => [
                                'path' => $backup->path(),
                                'size_bytes' => (int) $backup->sizeInBytes(),
                                'date' => $backup->date()->toIso8601String(),
                            ])
                            ->values()
                            ->all();

                        return [
                            'disk' => $destination->diskName(),
                            'backup_name' => $destination->backupName(),
                            'reachable' => $destination->isReachable(),
                            'connection_error' => $destination->connectionError()?->getMessage(),
                            'count' => $backups->count(),
                            'size_bytes' => (int) $destination->usedStorage(),
                            'newest_backup_at' => $newest?->date()->toIso8601String(),
                            'newest_backup_size_bytes' => $newest ? (int) $newest->sizeInBytes() : null,
                            'oldest_backup_at' => $oldest?->date()->toIso8601String(),
                            'oldest_backup_size_bytes' => $oldest ? (int) $oldest->sizeInBytes() : null,
                            'recent_backups' => $recentBackups,
                        ];
                    })
                    ->values();

                $latestBackup = $mappedDestinations
                    ->flatMap(fn (array $destination): array => $destination['recent_backups'])
                    ->sortByDesc(fn (array $backup): string => (string) $backup['date'])
                    ->first();
                $healthState = $this->resolveBackupHealthState(
                    latestBackupAt: $latestBackup['date'] ?? null,
                    destinations: $mappedDestinations->all(),
                    staleAfterMinutes: $staleAfterMinutes,
                );

                return [
                    'key' => $key,
                    'label' => $label,
                    'config' => $configKey,
                    'tracked_command_key' => $commandKey !== '' ? $commandKey : null,
                    'destinations' => $mappedDestinations->all(),
                    'latest_backup_at' => $latestBackup['date'] ?? null,
                    'latest_backup_size_bytes' => $latestBackup['size_bytes'] ?? null,
                    'total_backups' => $mappedDestinations->sum(fn (array $item): int => (int) $item['count']),
                    'total_size_bytes' => $mappedDestinations->sum(fn (array $item): int => (int) $item['size_bytes']),
                    'health_state' => $healthState,
                    'stale_after_minutes' => $staleAfterMinutes,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return array{
     *     total: int,
     *     pending: int,
     *     failed: int,
     *     synced: int,
     *     oldest_pending_at: string|null,
     *     last_synced_at: string|null
     * }
     */
    private function timeblockSyncMetrics(): array
    {
        $stats = TimeblockCalendarLink::query()
            ->selectRaw('sync_status, COUNT(*) as aggregate')
            ->groupBy('sync_status')
            ->pluck('aggregate', 'sync_status');

        $pending = (int) (
            (int) ($stats[TimeblockCalendarLink::STATUS_PENDING_CREATE] ?? 0)
            + (int) ($stats[TimeblockCalendarLink::STATUS_PENDING_UPDATE] ?? 0)
            + (int) ($stats[TimeblockCalendarLink::STATUS_PENDING_DELETE] ?? 0)
        );
        $failed = (int) ($stats[TimeblockCalendarLink::STATUS_FAILED] ?? 0);
        $synced = (int) ($stats[TimeblockCalendarLink::STATUS_SYNCED] ?? 0);

        return [
            'total' => $pending + $failed + $synced,
            'pending' => $pending,
            'failed' => $failed,
            'synced' => $synced,
            'oldest_pending_at' => TimeblockCalendarLink::query()
                ->whereIn('sync_status', [
                    TimeblockCalendarLink::STATUS_PENDING_CREATE,
                    TimeblockCalendarLink::STATUS_PENDING_UPDATE,
                    TimeblockCalendarLink::STATUS_PENDING_DELETE,
                ])
                ->min('created_at'),
            'last_synced_at' => TimeblockCalendarLink::query()
                ->whereNotNull('last_synced_at')
                ->max('last_synced_at'),
        ];
    }

    /**
     * @return array{
     *     total: int,
     *     active: int,
     *     never_synced: int,
     *     synced_last_24h: int,
     *     latest_synced_at: string|null
     * }
     */
    private function calendarMetrics(): array
    {
        return [
            'total' => Calendar::query()->count(),
            'active' => Calendar::query()->where('is_active', true)->count(),
            'never_synced' => Calendar::query()->whereNull('last_synced_at')->count(),
            'synced_last_24h' => Calendar::query()
                ->where('last_synced_at', '>=', now()->subDay())
                ->count(),
            'latest_synced_at' => Calendar::query()->max('last_synced_at'),
        ];
    }

    /**
     * @return array{
     *     total: int,
     *     active: int,
     *     orphaned: int,
     *     total_size_bytes: int
     * }
     */
    private function noteImageMetrics(): array
    {
        return [
            'total' => NoteImage::query()->count(),
            'active' => NoteImage::query()->where('status', 'active')->count(),
            'orphaned' => NoteImage::query()->where('status', 'orphaned')->count(),
            'total_size_bytes' => (int) (NoteImage::query()->sum('size_bytes') ?: 0),
        ];
    }

    /**
     * @return array{
     *     enabled: bool,
     *     entries_count: int|null,
     *     latest_created_at: string|null
     * }
     */
    private function telescopeMetrics(): array
    {
        if (! Schema::hasTable('telescope_entries')) {
            return [
                'enabled' => false,
                'entries_count' => null,
                'latest_created_at' => null,
            ];
        }

        return [
            'enabled' => true,
            'entries_count' => (int) DB::table('telescope_entries')->count(),
            'latest_created_at' => DB::table('telescope_entries')->max('created_at'),
        ];
    }

    /**
     * @return array{
     *     signals_count: int,
     *     indicators_count: int,
     *     latest_signal_at: string|null,
     *     latest_indicator_at: string|null,
     *     stale_indicator_count: int
     * }
     */
    private function dailySignalMetrics(): array
    {
        return [
            'signals_count' => WorkspaceDailySignal::query()->count(),
            'indicators_count' => WorkspaceDailyIndicator::query()->count(),
            'latest_signal_at' => WorkspaceDailySignal::query()->max('updated_at'),
            'latest_indicator_at' => WorkspaceDailyIndicator::query()->max('updated_at'),
            'stale_indicator_count' => WorkspaceDailyIndicator::query()
                ->where('updated_at', '<', now()->subHours(24))
                ->count(),
        ];
    }

    private function assertAdmin(Request $request): void
    {
        abort_unless((string) ($request->user()?->role ?? '') === 'admin', 403);
    }

    private function resolveScheduledHealthState(string $status, mixed $lastSuccessAt, int $staleAfterMinutes): string
    {
        if ($status === 'running') {
            return 'running';
        }

        if ($status === 'failed') {
            return 'failed';
        }

        $lastSuccess = $this->parseTimestamp($lastSuccessAt);
        if (! $lastSuccess) {
            return 'unknown';
        }

        if ($lastSuccess->lt(now()->subMinutes($staleAfterMinutes))) {
            return 'stale';
        }

        return 'healthy';
    }

    /**
     * @param  array<int, array<string, mixed>>  $destinations
     */
    private function resolveBackupHealthState(mixed $latestBackupAt, array $destinations, int $staleAfterMinutes): string
    {
        $hasUnreachableDestination = collect($destinations)
            ->contains(fn (array $destination): bool => ($destination['reachable'] ?? false) !== true);

        if ($hasUnreachableDestination) {
            return 'error';
        }

        $latest = $this->parseTimestamp($latestBackupAt);
        if (! $latest) {
            return 'stale';
        }

        if ($latest->lt(now()->subMinutes($staleAfterMinutes))) {
            return 'stale';
        }

        return 'healthy';
    }

    private function parseTimestamp(mixed $value): ?CarbonImmutable
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }
}
