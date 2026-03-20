<?php

return [
    'default_disk' => env('NOTE_IMAGE_DEFAULT_DISK', 'public'),
    'allowed_disks' => array_values(array_filter(array_map(
        static fn (string $value): string => trim($value),
        explode(',', (string) env('NOTE_IMAGE_ALLOWED_DISKS', 'public')),
    ), static fn (string $value): bool => $value !== '')),
    'folder' => env('NOTE_IMAGE_FOLDER', 'uploads/images'),
    'max_upload_mb' => (int) env('NOTE_IMAGE_MAX_UPLOAD_MB', 5),
    'unattached_grace_hours' => (int) env('NOTE_IMAGE_UNATTACHED_GRACE_HOURS', 24),
    'orphan_retention_days' => (int) env('NOTE_IMAGE_ORPHAN_RETENTION_DAYS', 7),
];
