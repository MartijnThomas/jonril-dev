<?php

return [
    'scheduled_commands' => [
        'telescope_prune' => [
            'label' => 'Telescope prune',
            'command' => 'telescope:prune --hours=48',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 36 * 60,
        ],
        'backup_clean_full' => [
            'label' => 'Backup cleanup (full)',
            'command' => 'backup:clean',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 36 * 60,
        ],
        'backup_run_full' => [
            'label' => 'Backup run (full)',
            'command' => 'backup:run',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 26 * 60,
        ],
        'backup_run_hourly_db' => [
            'label' => 'Backup run (hourly database)',
            'command' => 'backup:run --only-db --config=backup_hourly_db',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 120,
        ],
        'backup_clean_hourly_db' => [
            'label' => 'Backup cleanup (hourly database)',
            'command' => 'backup:clean --config=backup_hourly_db',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 180,
        ],
        'note_images_prune' => [
            'label' => 'Note image prune',
            'command' => 'notes:prune-images',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 36 * 60,
        ],
        'timeblocks_sync_outbound' => [
            'label' => 'Timeblock outbound sync dispatch',
            'command' => 'timeblocks:sync-outbound --limit=100',
            'timezone' => 'Europe/Amsterdam',
            'stale_after_minutes' => 10,
        ],
    ],

    'backup_profiles' => [
        'full' => [
            'label' => 'Daily full backup',
            'config' => 'backup',
            'command_key' => 'backup_run_full',
            'stale_after_minutes' => 26 * 60,
        ],
        'hourly_db' => [
            'label' => 'Hourly database backup',
            'config' => 'backup_hourly_db',
            'command_key' => 'backup_run_hourly_db',
            'stale_after_minutes' => 120,
        ],
    ],
];
