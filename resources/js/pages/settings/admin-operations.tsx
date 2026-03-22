import { Deferred, Head } from '@inertiajs/react';
import {
    CheckCircle2,
    Clock3,
    Database,
    HardDrive,
    TriangleAlert,
    XCircle,
} from 'lucide-react';
import { useMemo } from 'react';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { useI18n } from '@/lib/i18n';
import type { BreadcrumbItem } from '@/types';

type ScheduledHealthItem = {
    key: string;
    label: string;
    command: string;
    timezone: string;
    health_state: string;
    stale_after_minutes: number;
    last_status: string;
    last_started_at: string | null;
    last_finished_at: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
    last_duration_seconds: number | null;
    last_output: string | null;
};

type BackupFileItem = {
    path: string;
    size_bytes: number;
    date: string;
};

type BackupDestinationItem = {
    disk: string;
    backup_name: string;
    reachable: boolean;
    connection_error: string | null;
    count: number;
    size_bytes: number;
    newest_backup_at: string | null;
    newest_backup_size_bytes: number | null;
    oldest_backup_at: string | null;
    oldest_backup_size_bytes: number | null;
    recent_backups: BackupFileItem[];
};

type BackupProfileItem = {
    key: string;
    label: string;
    config: string;
    tracked_command_key: string | null;
    error?: string | null;
    destinations: BackupDestinationItem[];
    latest_backup_at: string | null;
    latest_backup_size_bytes: number | null;
    total_backups: number;
    total_size_bytes: number;
    health_state: string;
    stale_after_minutes: number;
};

type Props = {
    scheduledHealth?: ScheduledHealthItem[];
    backupProfiles?: BackupProfileItem[];
    timeblockSyncMetrics?: {
        total: number;
        pending: number;
        failed: number;
        synced: number;
        oldest_pending_at: string | null;
        last_synced_at: string | null;
    };
    calendarMetrics?: {
        total: number;
        active: number;
        never_synced: number;
        synced_last_24h: number;
        latest_synced_at: string | null;
    };
    noteImageMetrics?: {
        total: number;
        active: number;
        orphaned: number;
        total_size_bytes: number;
    };
    telescopeMetrics?: {
        enabled: boolean;
        entries_count: number | null;
        latest_created_at: string | null;
    };
    dailySignalMetrics?: {
        signals_count: number;
        indicators_count: number;
        latest_signal_at: string | null;
        latest_indicator_at: string | null;
        stale_indicator_count: number;
    };
};

const DEFERRED_BACKUPS_DATA = ['backupProfiles'] as const;
const DEFERRED_SCHEDULED_DATA = ['scheduledHealth'] as const;
const DEFERRED_METRICS_DATA = [
    'timeblockSyncMetrics',
    'calendarMetrics',
    'noteImageMetrics',
    'telescopeMetrics',
] as const;

function formatDate(value: string | null): string {
    if (!value) {
        return '—';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '—';
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatBytes(bytes: number | null): string {
    if (bytes === null || Number.isNaN(bytes)) {
        return '—';
    }

    if (bytes <= 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );
    const value = bytes / 1024 ** exponent;

    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function statusBadgeVariant(
    status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'healthy') {
        return 'default';
    }

    if (status === 'failed' || status === 'error') {
        return 'destructive';
    }

    if (status === 'running') {
        return 'secondary';
    }

    return 'outline';
}

function statusBadgeClass(status: string): string | undefined {
    if (status === 'stale') {
        return 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    }

    return undefined;
}

export default function AdminOperations({
    scheduledHealth = [],
    backupProfiles = [],
    timeblockSyncMetrics = {
        total: 0,
        pending: 0,
        failed: 0,
        synced: 0,
        oldest_pending_at: null,
        last_synced_at: null,
    },
    calendarMetrics = {
        total: 0,
        active: 0,
        never_synced: 0,
        synced_last_24h: 0,
        latest_synced_at: null,
    },
    noteImageMetrics = {
        total: 0,
        active: 0,
        orphaned: 0,
        total_size_bytes: 0,
    },
    telescopeMetrics = {
        enabled: false,
        entries_count: null,
        latest_created_at: null,
    },
    dailySignalMetrics = {
        signals_count: 0,
        indicators_count: 0,
        latest_signal_at: null,
        latest_indicator_at: null,
        stale_indicator_count: 0,
    },
}: Props) {
    const { t } = useI18n();

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('settings_operations.page_title', 'Operations health'),
                href: '/settings/admin/operations',
            },
        ],
        [t],
    );

    const totalBackups = backupProfiles.reduce(
        (sum, profile) => sum + profile.total_backups,
        0,
    );
    const totalBackupStorage = backupProfiles.reduce(
        (sum, profile) => sum + profile.total_size_bytes,
        0,
    );
    const latestBackupAt =
        backupProfiles
            .map((profile) => profile.latest_backup_at)
            .filter((value): value is string => typeof value === 'string')
            .sort((a, b) => b.localeCompare(a))[0] ?? null;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head
                title={t('settings_operations.page_title', 'Operations health')}
            />

            <SettingsLayout>
                <div className="space-y-8">
                    <Heading
                        variant="small"
                        title={t(
                            'settings_operations.heading',
                            'Operations health',
                        )}
                        description={t(
                            'settings_operations.description',
                            'Visibility into scheduled jobs, backups and background synchronization health.',
                        )}
                    />

                    <Deferred
                        data={DEFERRED_METRICS_DATA}
                        fallback={
                            <div className="h-52 animate-pulse rounded-lg border bg-muted/30" />
                        }
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    {t(
                                        'settings_operations.backups_title',
                                        'Backups',
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    {t(
                                        'settings_operations.metrics_description',
                                        'Current health indicators for background synchronization and data maintenance.',
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="grid gap-3 md:grid-cols-2">
                                <div className="rounded-md border p-3">
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        <Clock3 className="size-4 text-muted-foreground" />
                                        <span>
                                            {t(
                                                'settings_operations.timeblock_sync',
                                                'Timeblock sync',
                                            )}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        pending {timeblockSyncMetrics.pending} ·
                                        failed {timeblockSyncMetrics.failed} ·
                                        synced {timeblockSyncMetrics.synced}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        last synced:{' '}
                                        {formatDate(
                                            timeblockSyncMetrics.last_synced_at,
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-md border p-3">
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        <Database className="size-4 text-muted-foreground" />
                                        <span>
                                            {t(
                                                'settings_operations.calendars',
                                                'Calendars',
                                            )}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        total {calendarMetrics.total} · active{' '}
                                        {calendarMetrics.active} · never synced{' '}
                                        {calendarMetrics.never_synced}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        synced in 24h:{' '}
                                        {calendarMetrics.synced_last_24h}
                                    </p>
                                </div>

                                <div className="rounded-md border p-3">
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        <CheckCircle2 className="size-4 text-muted-foreground" />
                                        <span>
                                            {t(
                                                'settings_operations.note_images',
                                                'Note images',
                                            )}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        total {noteImageMetrics.total} · active{' '}
                                        {noteImageMetrics.active} · orphaned{' '}
                                        {noteImageMetrics.orphaned}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        storage:{' '}
                                        {formatBytes(
                                            noteImageMetrics.total_size_bytes,
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-md border p-3">
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        {telescopeMetrics.enabled ? (
                                            <TriangleAlert className="size-4 text-muted-foreground" />
                                        ) : (
                                            <XCircle className="size-4 text-muted-foreground" />
                                        )}
                                        <span>
                                            {t(
                                                'settings_operations.telescope',
                                                'Telescope',
                                            )}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {telescopeMetrics.enabled
                                            ? `entries ${telescopeMetrics.entries_count ?? 0}`
                                            : t(
                                                  'settings_operations.telescope_disabled',
                                                  'Telescope table unavailable',
                                              )}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {t(
                                            'settings_operations.last_seen',
                                            'Last seen',
                                        )}
                                        :{' '}
                                        {formatDate(
                                            telescopeMetrics.latest_created_at,
                                        )}
                                    </p>
                                </div>

                                <div className="rounded-md border p-3">
                                    <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                                        <CheckCircle2 className="size-4 text-muted-foreground" />
                                        <span>
                                            {t(
                                                'settings_operations.daily_signals',
                                                'Daily signals',
                                            )}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        signals{' '}
                                        {dailySignalMetrics.signals_count} ·
                                        indicators{' '}
                                        {dailySignalMetrics.indicators_count} ·
                                        stale{' '}
                                        {
                                            dailySignalMetrics.stale_indicator_count
                                        }
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {t(
                                            'settings_operations.last_seen',
                                            'Last seen',
                                        )}
                                        :{' '}
                                        {formatDate(
                                            dailySignalMetrics.latest_indicator_at ??
                                                dailySignalMetrics.latest_signal_at,
                                        )}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </Deferred>

                    <Deferred
                        data={DEFERRED_BACKUPS_DATA}
                        fallback={
                            <div className="space-y-4">
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                    {Array.from({ length: 3 }).map(
                                        (_, index) => (
                                            <Card key={index}>
                                                <CardHeader className="pb-2">
                                                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                                                    <div className="mt-2 h-4 w-20 animate-pulse rounded bg-muted" />
                                                </CardHeader>
                                            </Card>
                                        ),
                                    )}
                                </div>
                                <div className="h-64 animate-pulse rounded-lg border bg-muted/30" />
                            </div>
                        }
                    >
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>
                                        {t(
                                            'settings_operations.kpi_last_backup',
                                            'Last backup',
                                        )}
                                    </CardDescription>
                                    <CardTitle className="text-sm font-medium">
                                        {formatDate(latestBackupAt)}
                                    </CardTitle>
                                </CardHeader>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>
                                        {t(
                                            'settings_operations.kpi_backup_count',
                                            'Backup files',
                                        )}
                                    </CardDescription>
                                    <CardTitle className="text-sm font-medium">
                                        {totalBackups}
                                    </CardTitle>
                                </CardHeader>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2">
                                    <CardDescription>
                                        {t(
                                            'settings_operations.kpi_backup_storage',
                                            'Backup storage',
                                        )}
                                    </CardDescription>
                                    <CardTitle className="text-sm font-medium">
                                        {formatBytes(totalBackupStorage)}
                                    </CardTitle>
                                </CardHeader>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    {t(
                                        'settings_operations.backups_title',
                                        'Backups',
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    {t(
                                        'settings_operations.backups_description',
                                        'Daily full backup and hourly database backup profiles.',
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {backupProfiles.map((profile) => (
                                    <div
                                        key={profile.key}
                                        className="space-y-3 rounded-lg border p-3"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="space-y-0.5">
                                                <p className="font-medium">
                                                    {profile.label}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {t(
                                                        'settings_operations.last_backup',
                                                        'Last backup',
                                                    )}
                                                    :{' '}
                                                    {formatDate(
                                                        profile.latest_backup_at,
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                <Badge
                                                    variant={statusBadgeVariant(
                                                        profile.health_state,
                                                    )}
                                                    className={statusBadgeClass(
                                                        profile.health_state,
                                                    )}
                                                >
                                                    {profile.health_state}
                                                </Badge>
                                                <span>
                                                    {t(
                                                        'settings_operations.total_files',
                                                        'Files',
                                                    )}
                                                    : {profile.total_backups}
                                                </span>
                                                <span>
                                                    {t(
                                                        'settings_operations.total_size',
                                                        'Size',
                                                    )}
                                                    :{' '}
                                                    {formatBytes(
                                                        profile.total_size_bytes,
                                                    )}
                                                </span>
                                            </div>
                                        </div>

                                        {profile.error ? (
                                            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                                                {profile.error}
                                            </div>
                                        ) : null}

                                        {profile.destinations.map(
                                            (destination) => (
                                                <div
                                                    key={`${profile.key}-${destination.disk}`}
                                                    className="rounded-md border p-3"
                                                >
                                                    <div className="mb-2 flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 text-sm">
                                                            <HardDrive className="size-4 text-muted-foreground" />
                                                            <span className="font-medium">
                                                                {
                                                                    destination.disk
                                                                }
                                                            </span>
                                                            <Badge
                                                                variant={
                                                                    destination.reachable
                                                                        ? 'secondary'
                                                                        : 'destructive'
                                                                }
                                                            >
                                                                {destination.reachable
                                                                    ? 'reachable'
                                                                    : 'unreachable'}
                                                            </Badge>
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {destination.count}{' '}
                                                            files ·{' '}
                                                            {formatBytes(
                                                                destination.size_bytes,
                                                            )}
                                                        </div>
                                                    </div>
                                                    {destination.connection_error ? (
                                                        <p className="mb-2 text-xs text-destructive">
                                                            {
                                                                destination.connection_error
                                                            }
                                                        </p>
                                                    ) : null}
                                                    <div className="space-y-1 text-xs text-muted-foreground">
                                                        <p>
                                                            {t(
                                                                'settings_operations.newest',
                                                                'Newest',
                                                            )}
                                                            :{' '}
                                                            {formatDate(
                                                                destination.newest_backup_at,
                                                            )}
                                                        </p>
                                                        <p>
                                                            {t(
                                                                'settings_operations.oldest',
                                                                'Oldest',
                                                            )}
                                                            :{' '}
                                                            {formatDate(
                                                                destination.oldest_backup_at,
                                                            )}
                                                        </p>
                                                    </div>
                                                    {destination.recent_backups
                                                        .length > 0 ? (
                                                        <div className="mt-3 max-h-44 overflow-y-auto rounded-md border">
                                                            {destination.recent_backups.map(
                                                                (backup) => (
                                                                    <div
                                                                        key={`${destination.disk}-${backup.path}`}
                                                                        className="flex items-center justify-between border-b px-2 py-1.5 text-xs last:border-b-0"
                                                                    >
                                                                        <span className="truncate pr-2 text-muted-foreground">
                                                                            {
                                                                                backup.path
                                                                            }
                                                                        </span>
                                                                        <span className="shrink-0">
                                                                            {formatBytes(
                                                                                backup.size_bytes,
                                                                            )}
                                                                        </span>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ),
                                        )}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </Deferred>

                    <Deferred
                        data={DEFERRED_SCHEDULED_DATA}
                        fallback={
                            <div className="h-52 animate-pulse rounded-lg border bg-muted/30" />
                        }
                    >
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">
                                    {t(
                                        'settings_operations.scheduled_title',
                                        'Scheduled commands',
                                    )}
                                </CardTitle>
                                <CardDescription>
                                    {t(
                                        'settings_operations.scheduled_description',
                                        'Last observed execution status and timing from scheduler callbacks.',
                                    )}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {scheduledHealth.map((item) => (
                                    <div
                                        key={item.key}
                                        className="rounded-md border p-3"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="space-y-0.5">
                                                <p className="text-sm font-medium">
                                                    {item.label}
                                                </p>
                                                <p className="font-mono text-xs text-muted-foreground">
                                                    {item.command}
                                                </p>
                                            </div>
                                            <Badge
                                                variant={statusBadgeVariant(
                                                    item.health_state,
                                                )}
                                                className={statusBadgeClass(
                                                    item.health_state,
                                                )}
                                            >
                                                {item.health_state}
                                            </Badge>
                                        </div>
                                        <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                                            <p>
                                                {t(
                                                    'settings_operations.last_started',
                                                    'Started',
                                                )}
                                                :{' '}
                                                {formatDate(
                                                    item.last_started_at,
                                                )}
                                            </p>
                                            <p>
                                                {t(
                                                    'settings_operations.last_finished',
                                                    'Finished',
                                                )}
                                                :{' '}
                                                {formatDate(
                                                    item.last_finished_at,
                                                )}
                                            </p>
                                            <p>
                                                {t(
                                                    'settings_operations.last_success',
                                                    'Success',
                                                )}
                                                :{' '}
                                                {formatDate(
                                                    item.last_success_at,
                                                )}
                                            </p>
                                            <p>
                                                {t(
                                                    'settings_operations.last_failure',
                                                    'Failure',
                                                )}
                                                :{' '}
                                                {formatDate(
                                                    item.last_failure_at,
                                                )}
                                            </p>
                                            <p>
                                                {t(
                                                    'settings_operations.duration',
                                                    'Duration',
                                                )}
                                                :{' '}
                                                {item.last_duration_seconds ??
                                                    '—'}
                                                s
                                            </p>
                                            <p>
                                                {t(
                                                    'settings_operations.timezone',
                                                    'Timezone',
                                                )}
                                                : {item.timezone}
                                            </p>
                                        </div>
                                        {item.last_output ? (
                                            <pre className="mt-2 max-h-24 overflow-y-auto rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
                                                {item.last_output}
                                            </pre>
                                        ) : null}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </Deferred>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
