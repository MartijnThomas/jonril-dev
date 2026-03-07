<?php

return [
    'autosave' => [
        // Fallback interval used when a user has no preference set.
        'default_interval_minutes' => 15,
        // Clamp user preferences to a safe range.
        'min_interval_minutes' => 5,
        'max_interval_minutes' => 60,
    ],

    'retention' => [
        // Keep everything from the last X hours.
        'keep_all_for_hours' => 24,
        // Between keep_all and this window: keep max 1 revision per hour.
        'keep_hourly_for_days' => 7,
        // Between hourly and this window: keep max 1 revision per day.
        'keep_daily_for_days' => 30,
        // Between daily and this window: keep max 1 revision per week.
        'keep_weekly_for_weeks' => 26,
    ],

    'prune' => [
        // Cron expression for scheduled pruning.
        'cron' => '0 * * * *',
    ],
];
