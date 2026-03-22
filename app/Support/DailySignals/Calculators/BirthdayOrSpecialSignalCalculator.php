<?php

namespace App\Support\DailySignals\Calculators;

use App\Models\Event;
use App\Models\Workspace;
use App\Support\DailySignals\Contracts\DailySignalCalculator;
use App\Support\DailySignals\Data\DailySignalResult;
use Carbon\CarbonInterface;

class BirthdayOrSpecialSignalCalculator implements DailySignalCalculator
{
    public function key(): string
    {
        return 'birthday_or_special';
    }

    public function calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult
    {
        $birthdayCount = Event::query()
            ->where('workspace_id', $workspace->id)
            ->whereNull('remote_deleted_at')
            ->where('meta->event_type', 'birthday')
            ->where('meta->birthday_month', (int) $date->month)
            ->where('meta->birthday_day', (int) $date->day)
            ->count();

        return new DailySignalResult(
            key: $this->key(),
            state: $birthdayCount > 0 ? 'has_birthdays' : 'none',
            value: ['birthday_count' => $birthdayCount],
        );
    }
}
