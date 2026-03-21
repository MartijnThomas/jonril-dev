<?php

namespace App\Support\System;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class ScheduledCommandHealthStore
{
    private const CACHE_PREFIX = 'system:scheduled-command-health:';

    /**
     * @param  array<string, mixed>  $context
     */
    public static function markStarted(string $key, array $context = []): void
    {
        $existing = self::get($key);
        $timestamp = CarbonImmutable::now();

        Cache::forever(self::cacheKey($key), [
            ...$existing,
            'key' => $key,
            'command' => (string) ($context['command'] ?? ($existing['command'] ?? '')),
            'label' => (string) ($context['label'] ?? ($existing['label'] ?? $key)),
            'expression' => (string) ($context['expression'] ?? ($existing['expression'] ?? '')),
            'timezone' => (string) ($context['timezone'] ?? ($existing['timezone'] ?? config('app.timezone', 'UTC'))),
            'last_status' => 'running',
            'last_started_at' => $timestamp->toIso8601String(),
            'last_context' => $context,
        ]);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public static function markSuccess(string $key, array $context = []): void
    {
        self::markFinished($key, 'success', $context);
    }

    /**
     * @param  array<string, mixed>  $context
     */
    public static function markFailure(string $key, array $context = []): void
    {
        self::markFinished($key, 'failed', $context);
    }

    /**
     * @return array<string, mixed>
     */
    public static function get(string $key): array
    {
        $payload = Cache::get(self::cacheKey($key));

        return is_array($payload) ? $payload : [];
    }

    /**
     * @param  array<int, string>  $keys
     * @return array<string, array<string, mixed>>
     */
    public static function getMany(array $keys): array
    {
        return collect($keys)
            ->mapWithKeys(fn (string $key): array => [$key => self::get($key)])
            ->all();
    }

    /**
     * @param  array<string, mixed>  $context
     */
    private static function markFinished(string $key, string $status, array $context): void
    {
        $existing = self::get($key);
        $finishedAt = CarbonImmutable::now();
        $startedAt = self::parseTimestamp($existing['last_started_at'] ?? null);
        $durationSeconds = $startedAt?->diffInSeconds($finishedAt);
        $output = isset($context['output']) ? trim((string) $context['output']) : null;

        $payload = [
            ...$existing,
            'key' => $key,
            'command' => (string) ($context['command'] ?? ($existing['command'] ?? '')),
            'label' => (string) ($context['label'] ?? ($existing['label'] ?? $key)),
            'expression' => (string) ($context['expression'] ?? ($existing['expression'] ?? '')),
            'timezone' => (string) ($context['timezone'] ?? ($existing['timezone'] ?? config('app.timezone', 'UTC'))),
            'last_status' => $status,
            'last_finished_at' => $finishedAt->toIso8601String(),
            'last_duration_seconds' => $durationSeconds,
            'last_output' => $output !== null && $output !== '' ? Str::limit($output, 500) : null,
            'last_context' => $context,
        ];

        if ($status === 'success') {
            $payload['last_success_at'] = $finishedAt->toIso8601String();
        } else {
            $payload['last_failure_at'] = $finishedAt->toIso8601String();
        }

        Cache::forever(self::cacheKey($key), $payload);
    }

    private static function cacheKey(string $key): string
    {
        return self::CACHE_PREFIX.$key;
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
