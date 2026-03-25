<?php

namespace App\Support\System;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Spatie\Backup\BackupDestination\BackupDestination;
use Spatie\Backup\BackupDestination\BackupDestinationFactory;
use Spatie\Backup\Config\Config as BackupConfig;

class BackupProfilesCache
{
    private const CACHE_KEY = 'system:backup-profiles';

    private const CACHE_TTL_HOURS = 24;

    /**
     * @return array{status: string, cached_at: string|null, profiles: array<int, array<string, mixed>>}
     */
    public static function get(): array
    {
        $cached = Cache::get(self::CACHE_KEY);

        if (is_array($cached)) {
            return $cached;
        }

        return [
            'status' => 'pending',
            'cached_at' => null,
            'profiles' => [],
        ];
    }

    public static function markRefreshing(): void
    {
        $current = self::get();

        Cache::put(self::CACHE_KEY, [
            ...$current,
            'status' => 'refreshing',
        ], now()->addHours(self::CACHE_TTL_HOURS));
    }

    public static function refresh(): void
    {
        Cache::put(self::CACHE_KEY, [
            'status' => 'ready',
            'cached_at' => CarbonImmutable::now()->toIso8601String(),
            'profiles' => self::buildProfiles(),
        ], now()->addHours(self::CACHE_TTL_HOURS));
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function buildProfiles(): array
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

                $healthState = self::resolveHealthState(
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
     * @param  array<int, array<string, mixed>>  $destinations
     */
    private static function resolveHealthState(mixed $latestBackupAt, array $destinations, int $staleAfterMinutes): string
    {
        $hasUnreachableDestination = collect($destinations)
            ->contains(fn (array $destination): bool => ($destination['reachable'] ?? false) !== true);

        if ($hasUnreachableDestination) {
            return 'error';
        }

        $latest = self::parseTimestamp($latestBackupAt);

        if (! $latest) {
            return 'stale';
        }

        if ($latest->lt(now()->subMinutes($staleAfterMinutes))) {
            return 'stale';
        }

        return 'healthy';
    }

    private static function parseTimestamp(mixed $value): ?CarbonImmutable
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
