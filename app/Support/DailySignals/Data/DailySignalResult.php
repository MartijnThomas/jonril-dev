<?php

namespace App\Support\DailySignals\Data;

final readonly class DailySignalResult
{
    /**
     * @param  array<string, mixed>|null  $value
     */
    public function __construct(
        public string $key,
        public string $state,
        public ?array $value = null,
    ) {}
}
