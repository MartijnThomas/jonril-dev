<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

class RunAdminMaintenanceCommandJob implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<int, array{command: string, parameters: array<string, mixed>}>  $commands
     */
    public function __construct(
        public readonly string $action,
        public readonly string $label,
        public readonly array $commands,
        public readonly int $initiatedByUserId,
    ) {}

    public function handle(): void
    {
        $start = now();
        Cache::put($this->cacheKey(), [
            'status' => 'running',
            'label' => $this->label,
            'started_at' => $start->toIso8601String(),
            'finished_at' => null,
            'duration_seconds' => null,
            'initiated_by_user_id' => $this->initiatedByUserId,
            'commands' => $this->commands,
            'results' => [],
            'error' => null,
        ], now()->addDays(7));

        $results = [];

        try {
            foreach ($this->commands as $commandDefinition) {
                $command = trim((string) ($commandDefinition['command'] ?? ''));
                $parameters = is_array($commandDefinition['parameters'] ?? null)
                    ? $commandDefinition['parameters']
                    : [];

                if ($command === '') {
                    continue;
                }

                $exitCode = Artisan::call($command, $parameters);
                $results[] = [
                    'command' => $command,
                    'parameters' => $parameters,
                    'exit_code' => $exitCode,
                    'output' => trim(Artisan::output()),
                ];

                if ($exitCode !== 0) {
                    throw new \RuntimeException("Command [{$command}] failed with exit code {$exitCode}.");
                }
            }

            Cache::put($this->cacheKey(), [
                'status' => 'success',
                'label' => $this->label,
                'started_at' => $start->toIso8601String(),
                'finished_at' => now()->toIso8601String(),
                'duration_seconds' => now()->diffInSeconds($start),
                'initiated_by_user_id' => $this->initiatedByUserId,
                'commands' => $this->commands,
                'results' => $results,
                'error' => null,
            ], now()->addDays(7));
        } catch (Throwable $exception) {
            Cache::put($this->cacheKey(), [
                'status' => 'failed',
                'label' => $this->label,
                'started_at' => $start->toIso8601String(),
                'finished_at' => now()->toIso8601String(),
                'duration_seconds' => now()->diffInSeconds($start),
                'initiated_by_user_id' => $this->initiatedByUserId,
                'commands' => $this->commands,
                'results' => $results,
                'error' => $exception->getMessage(),
            ], now()->addDays(7));

            Log::error('Admin maintenance action failed.', [
                'action' => $this->action,
                'label' => $this->label,
                'initiated_by_user_id' => $this->initiatedByUserId,
                'error' => $exception->getMessage(),
            ]);

            throw $exception;
        }
    }

    private function cacheKey(): string
    {
        return 'admin:maintenance:last-run:'.$this->action;
    }
}
