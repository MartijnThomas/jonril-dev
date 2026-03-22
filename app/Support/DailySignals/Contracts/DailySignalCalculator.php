<?php

namespace App\Support\DailySignals\Contracts;

use App\Models\Workspace;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

interface DailySignalCalculator
{
    public function key(): string;

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult;
}
