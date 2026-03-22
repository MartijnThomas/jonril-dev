import { Head, router, usePage } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { useI18n } from '@/lib/i18n';
import type { BreadcrumbItem } from '@/types';

type Props = {
    maintenanceActions?: Record<
        string,
        {
            key: string;
            label: string;
            description: string;
            commands: Array<{ command: string; parameters: Record<string, unknown> }>;
        }
    >;
    maintenanceRuns?: Record<
        string,
        {
            status?: string;
            started_at?: string | null;
            finished_at?: string | null;
            error?: string | null;
        }
    >;
    status?: string;
};

function formatDate(value: string | null | undefined): string {
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

export default function AdminMaintenance({
    maintenanceActions = {},
    maintenanceRuns = {},
    status,
}: Props) {
    const { t } = useI18n();
    const page = usePage<{ status?: string }>();
    const [runningActionKey, setRunningActionKey] = useState<string | null>(null);

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('settings_operations.maintenance_page_title', 'Maintenance actions'),
                href: '/settings/admin/maintenance',
            },
        ],
        [t],
    );

    const maintenanceActionItems = Object.values(maintenanceActions);
    const dispatched = status === 'admin-maintenance-dispatched' || page.props.status === 'admin-maintenance-dispatched';

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings_operations.maintenance_page_title', 'Maintenance actions')} />

            <SettingsLayout>
                <div className="space-y-8">
                    <Heading
                        variant="small"
                        title={t('settings_operations.maintenance_page_title', 'Maintenance actions')}
                        description={t(
                            'settings_operations.maintenance_page_description',
                            'Manually trigger operational maintenance commands.',
                        )}
                    />

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base">
                                {t(
                                    'settings_operations.maintenance_actions_title',
                                    'Maintenance actions',
                                )}
                            </CardTitle>
                            <CardDescription>
                                {t(
                                    'settings_operations.maintenance_actions_description',
                                    'Dispatch maintenance commands on demand.',
                                )}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {maintenanceActionItems.map((action) => {
                                const run = maintenanceRuns[action.key] ?? {};
                                const runStatus = String(run.status ?? 'idle');

                                return (
                                    <div
                                        key={action.key}
                                        className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium">{action.label}</p>
                                            <p className="text-xs text-muted-foreground">{action.description}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {action.commands.map((command) => command.command).join(' • ')}
                                            </p>
                                            {runStatus !== 'idle' ? (
                                                <p className="text-xs text-muted-foreground">
                                                    last run: {runStatus} ·{' '}
                                                    {formatDate(
                                                        (run.finished_at as string | null) ??
                                                            (run.started_at as string | null) ??
                                                            null,
                                                    )}
                                                </p>
                                            ) : null}
                                            {typeof run.error === 'string' && run.error.trim() !== '' ? (
                                                <p className="text-xs text-destructive">{run.error}</p>
                                            ) : null}
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={runningActionKey === action.key}
                                            onClick={() => {
                                                setRunningActionKey(action.key);
                                                router.post(
                                                    '/settings/admin/operations/maintenance',
                                                    {
                                                        action: action.key,
                                                    },
                                                    {
                                                        preserveScroll: true,
                                                        onFinish: () => setRunningActionKey(null),
                                                    },
                                                );
                                            }}
                                        >
                                            {runningActionKey === action.key
                                                ? t('settings_operations.maintenance_running', 'Dispatching…')
                                                : t('settings_operations.maintenance_run_now', 'Run now')}
                                        </Button>
                                    </div>
                                );
                            })}
                            {dispatched ? (
                                <p className="text-xs text-muted-foreground">
                                    {t(
                                        'settings_operations.maintenance_dispatched',
                                        'Maintenance job dispatched.',
                                    )}
                                </p>
                            ) : null}
                        </CardContent>
                    </Card>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
