import { Head, Link, router } from '@inertiajs/react';
import { Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { InlineEditable } from '@/components/ui/inline-editable';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { useI18n } from '@/lib/i18n';
import type { BreadcrumbItem } from '@/types';

type FilterPreset = {
    id: string;
    name: string;
    favorite: boolean;
    filters: Record<string, unknown>;
    updated_at: string | null;
};

type Props = {
    filterPresets: FilterPreset[];
};

export default function TaskFiltersSettings({ filterPresets }: Props) {
    const { t } = useI18n();
    const [edits, setEdits] = useState<Record<string, { name: string; favorite: boolean }>>(
        () =>
            Object.fromEntries(
                filterPresets.map((preset) => [
                    preset.id,
                    { name: preset.name, favorite: preset.favorite },
                ]),
            ),
    );
    const [processingId, setProcessingId] = useState<string | null>(null);

    const formatPresetFilters = (preset: FilterPreset) => {
        const filters = preset.filters ?? {};
        const parts: string[] = [];

        const workspaceCount = Array.isArray(filters.workspace_ids)
            ? filters.workspace_ids.length
            : 0;
        if (workspaceCount > 0) {
            parts.push(
                `${workspaceCount} ${workspaceCount === 1 ? 'workspace' : 'workspaces'}`,
            );
        }

        const noteScopeCount = Array.isArray(filters.note_scope_ids)
            ? filters.note_scope_ids.length
            : 0;
        if (noteScopeCount > 0) {
            parts.push(
                `${noteScopeCount} ${noteScopeCount === 1 ? 'note scope' : 'note scopes'}`,
            );
        }

        const statuses = Array.isArray(filters.status)
            ? filters.status.filter((value): value is string => typeof value === 'string')
            : [];
        if (statuses.length > 0) {
            parts.push(`status: ${statuses.join(', ')}`);
        }

        const datePreset =
            typeof filters.date_preset === 'string' ? filters.date_preset : '';
        if (datePreset) {
            parts.push(`period: ${datePreset}`);
        } else {
            const from = typeof filters.date_from === 'string' ? filters.date_from : '';
            const to = typeof filters.date_to === 'string' ? filters.date_to : '';
            if (from || to) {
                parts.push(`period: ${from || '...'} - ${to || '...'}`);
            }
        }

        const groupBy = typeof filters.group_by === 'string' ? filters.group_by : '';
        if (groupBy && groupBy !== 'none') {
            parts.push(`group: ${groupBy}`);
        }

        return parts.length > 0
            ? parts.join(' • ')
            : t('task_filter_presets.no_filter_details', 'No explicit filters saved.');
    };

    const buildPresetHref = (preset: FilterPreset) => {
        const filters = preset.filters ?? {};
        const params = new URLSearchParams();

        const appendList = (key: string, value: unknown) => {
            if (!Array.isArray(value)) {
                return;
            }
            value
                .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
                .forEach((item) => params.append(key, item));
        };

        appendList('workspace_ids[]', filters.workspace_ids);
        appendList('note_scope_ids[]', filters.note_scope_ids);
        appendList('status[]', filters.status);

        if (typeof filters.date_preset === 'string' && filters.date_preset.trim() !== '') {
            params.set('date_preset', filters.date_preset);
        } else {
            if (typeof filters.date_from === 'string' && filters.date_from.trim() !== '') {
                params.set('date_from', filters.date_from);
            }
            if (typeof filters.date_to === 'string' && filters.date_to.trim() !== '') {
                params.set('date_to', filters.date_to);
            }
        }

        if (typeof filters.group_by === 'string' && filters.group_by.trim() !== '') {
            params.set('group_by', filters.group_by);
        }

        const query = params.toString();
        return query === '' ? '/tasks' : `/tasks?${query}`;
    };

    const breadcrumbs: BreadcrumbItem[] = useMemo(
        () => [
            {
                title: t('task_filter_presets.page_title', 'Task filters'),
                href: '/settings/task-filters',
            },
        ],
        [t],
    );

    const updatePreset = (
        presetId: string,
        overrides?: Partial<{ name: string; favorite: boolean }>,
    ) => {
        const current = edits[presetId];
        if (!current || processingId) {
            return;
        }

        const name = (overrides?.name ?? current.name).trim();
        if (name === '') {
            return;
        }

        const favorite = overrides?.favorite ?? current.favorite;

        setEdits((prev) => ({
            ...prev,
            [presetId]: {
                name,
                favorite,
            },
        }));

        setProcessingId(presetId);
        router.patch(
            `/settings/task-filters/${presetId}`,
            {
                name,
                favorite,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onFinish: () => setProcessingId(null),
            },
        );
    };

    const deletePreset = (presetId: string) => {
        if (processingId) {
            return;
        }

        setProcessingId(presetId);
        router.delete(`/settings/task-filters/${presetId}`, {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            onFinish: () => setProcessingId(null),
        });
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('task_filter_presets.page_title', 'Task filters')} />

            <h1 className="sr-only">
                {t('task_filter_presets.page_title', 'Task filters')}
            </h1>

            <SettingsLayout>
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title={t('task_filter_presets.heading', 'Task filters')}
                        description={t(
                            'task_filter_presets.description',
                            'Manage saved task filters: rename, favorite, or remove.',
                        )}
                    />

                    <div className="space-y-3">
                        {filterPresets.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                {t(
                                    'task_filter_presets.empty',
                                    'No saved filters yet. Save one from the Tasks page.',
                                )}
                            </p>
                        ) : (
                            filterPresets.map((preset) => {
                                const current = edits[preset.id] ?? {
                                    name: preset.name,
                                    favorite: preset.favorite,
                                };
                                const isProcessing = processingId === preset.id;

                                return (
                                    <div
                                        key={preset.id}
                                        className="rounded-lg border bg-card p-4"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <InlineEditable
                                                value={current.name}
                                                onSave={(name) =>
                                                    updatePreset(preset.id, { name })
                                                }
                                                disabled={isProcessing}
                                                className="min-w-0 flex-1"
                                                renderValue={(value) => (
                                                    <Link
                                                        href={buildPresetHref(preset)}
                                                        className="truncate text-sm font-medium text-foreground underline-offset-2 hover:underline"
                                                    >
                                                        {value}
                                                    </Link>
                                                )}
                                                editAriaLabel={t(
                                                    'task_filter_presets.edit_name',
                                                    'Edit filter name',
                                                )}
                                                saveAriaLabel={t(
                                                    'task_filter_presets.save_name',
                                                    'Save filter name',
                                                )}
                                            />

                                            <div className="flex items-center gap-1">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        updatePreset(preset.id, {
                                                            favorite: !current.favorite,
                                                        })
                                                    }
                                                    disabled={isProcessing}
                                                    aria-label={t(
                                                        'task_filter_presets.favorite',
                                                        'Favorite',
                                                    )}
                                                    className="text-muted-foreground hover:text-foreground"
                                                >
                                                    <Star
                                                        className={`h-4 w-4 ${current.favorite ? 'fill-amber-500 text-amber-500' : ''}`}
                                                    />
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() =>
                                                        deletePreset(preset.id)
                                                    }
                                                    disabled={isProcessing}
                                                    aria-label={t(
                                                        'task_filter_presets.delete',
                                                        'Delete',
                                                    )}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {formatPresetFilters(preset)}
                                        </p>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
