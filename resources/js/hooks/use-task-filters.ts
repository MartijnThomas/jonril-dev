import { router } from '@inertiajs/react';
import {
    addDays,
    endOfMonth,
    endOfWeek,
    format,
    parseISO,
    startOfMonth,
    startOfWeek,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { useMemo, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { toast } from 'sonner';

export type Filters = {
    workspace_ids: string[];
    note_scope_ids: string[];
    date_preset: '' | 'today' | 'this_week' | 'this_month' | 'today_plus_7';
    date_from: string;
    date_to: string;
    status: string[];
    group_by: 'none' | 'note' | 'date';
    q: string;
};

export type FilterPreset = {
    id: string;
    name: string;
    favorite: boolean;
    default: boolean;
    filters: Filters;
    updated_at: string | null;
};

interface UseTaskFiltersOptions {
    initialFilters: Filters;
    filterPresets: FilterPreset[];
    t: (key: string, fallback: string) => string;
    dateLocale: Locale;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useTaskFilters({
    initialFilters,
    filterPresets,
    t,
    dateLocale,
}: UseTaskFiltersOptions) {
    const [localFilters, setLocalFilters] = useState<Filters>({
        ...initialFilters,
        date_preset: initialFilters.date_preset ?? '',
        workspace_ids:
            initialFilters.workspace_ids && initialFilters.workspace_ids.length > 0
                ? initialFilters.workspace_ids
                : [],
        note_scope_ids:
            initialFilters.note_scope_ids && initialFilters.note_scope_ids.length > 0
                ? initialFilters.note_scope_ids
                : [],
        group_by: initialFilters.group_by ?? 'none',
        q: initialFilters.q ?? '',
    });

    const [savePresetOpen, setSavePresetOpen] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [presetFavorite, setPresetFavorite] = useState(false);
    const [presetProcessing, setPresetProcessing] = useState(false);

    const statusOptions = useMemo(
        () => [
            { value: 'open', label: t('tasks_index.status_open', 'Open') },
            { value: '__divider_1__' as const, label: '' },
            { value: 'in_progress', label: t('tasks_index.status_in_progress', 'Onderhanden') },
            { value: 'starred', label: t('tasks_index.status_starred', 'Gemarkeerd') },
            { value: 'backlog', label: t('tasks_index.status_backlog', 'Backlog') },
            { value: 'assigned', label: t('tasks_index.status_assigned', 'Toegewezen') },
            { value: '__divider_2__' as const, label: '' },
            { value: 'migrated', label: t('tasks_index.status_migrated', 'Gemigreerd') },
            { value: 'canceled', label: t('tasks_index.status_canceled', 'Geannuleerd') },
            { value: '__divider_3__' as const, label: '' },
            { value: 'completed', label: t('tasks_index.status_completed', 'Afgerond') },
        ],
        [t],
    );

    const statusSelectionLabels = useMemo(
        () =>
            localFilters.status
                .map((value) => statusOptions.find((option) => option.value === value)?.label)
                .filter((label): label is string => Boolean(label)),
        [localFilters.status, statusOptions],
    );

    const groupingOptions = useMemo(
        () => [
            { value: 'note' as const, label: t('tasks_index.group_by_note', 'By note') },
            { value: 'date' as const, label: t('tasks_index.group_by_date', 'By due & deadline') },
        ],
        [t],
    );

    const datePresetOptions = useMemo(
        () => [
            { value: 'today' as const, label: t('tasks_index.date_preset_today', 'Today') },
            { value: 'this_week' as const, label: t('tasks_index.date_preset_this_week', 'This week') },
            { value: 'this_month' as const, label: t('tasks_index.date_preset_this_month', 'This month') },
            { value: 'today_plus_7' as const, label: t('tasks_index.date_preset_today_plus_7', 'Today + 7 days') },
        ],
        [t],
    );

    const resolveDatePresetRange = (
        preset: Filters['date_preset'],
    ): { from: string; to: string } | null => {
        const today = new Date();
        const toIsoDate = (value: Date) => format(value, 'yyyy-MM-dd');

        if (preset === 'today') {
            const day = toIsoDate(today);
            return { from: day, to: day };
        }

        if (preset === 'this_week') {
            return {
                from: toIsoDate(startOfWeek(today, { weekStartsOn: 1 })),
                to: toIsoDate(endOfWeek(today, { weekStartsOn: 1 })),
            };
        }

        if (preset === 'this_month') {
            return {
                from: toIsoDate(startOfMonth(today)),
                to: toIsoDate(endOfMonth(today)),
            };
        }

        if (preset === 'today_plus_7') {
            return {
                from: toIsoDate(today),
                to: toIsoDate(addDays(today, 7)),
            };
        }

        return null;
    };

    const normalizeFilterState = (state: Partial<Filters> | Filters): Filters => {
        const allowedStatuses = new Set([
            'open',
            'completed',
            'canceled',
            'migrated',
            'assigned',
            'in_progress',
            'starred',
            'backlog',
        ]);

        const normalizedStatuses = [...(state.status ?? ['open'])]
            .map((value) => (value === 'question' ? 'backlog' : value))
            .filter((value): value is string => allowedStatuses.has(value));

        return {
            workspace_ids: [...(state.workspace_ids ?? [])]
                .map((id) => id.trim())
                .filter((id) => id !== '')
                .sort(),
            note_scope_ids: [...(state.note_scope_ids ?? [])]
                .map((id) => id.trim())
                .filter((id) => id !== '')
                .sort(),
            date_preset:
                state.date_preset && ['today', 'this_week', 'this_month', 'today_plus_7'].includes(state.date_preset)
                    ? state.date_preset
                    : '',
            date_from: state.date_preset ? '' : (state.date_from?.trim() ?? ''),
            date_to: state.date_preset ? '' : (state.date_to?.trim() ?? ''),
            status: (normalizedStatuses.length > 0 ? normalizedStatuses : ['open']).sort(),
            group_by:
                state.group_by && ['none', 'note', 'date'].includes(state.group_by)
                    ? state.group_by
                    : 'none',
            q: state.q?.trim() ?? '',
        };
    };

    const filterSignature = (state: Partial<Filters> | Filters) =>
        JSON.stringify(normalizeFilterState(state));

    const groupingSelectionLabel = useMemo(
        () =>
            groupingOptions.find((option) => option.value === localFilters.group_by)?.label ??
            t('tasks_index.group_by_none', 'No grouping'),
        [groupingOptions, localFilters.group_by, t],
    );

    const activeFilterPreset = useMemo(
        () =>
            filterPresets.find(
                (preset) => filterSignature(preset.filters) === filterSignature(localFilters),
            ) ?? null,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [filterPresets, localFilters],
    );

    const toQuery = (state: Filters) => {
        const query: Record<string, string | number | string[]> = {};
        if (state.workspace_ids.length > 0) { query.workspace_ids = state.workspace_ids; }
        if (state.note_scope_ids.length > 0) { query.note_scope_ids = state.note_scope_ids; }
        if (state.date_preset) {
            query.date_preset = state.date_preset;
        } else {
            if (state.date_from) { query.date_from = state.date_from; }
            if (state.date_to) { query.date_to = state.date_to; }
        }
        if (state.status.length > 0) { query.status = state.status; }
        if (state.group_by) { query.group_by = state.group_by; }
        if (state.q.trim() !== '') { query.q = state.q.trim(); }

        return query;
    };

    const visitWithFilters = (state: Filters) => {
        router.get('/tasks', toQuery(state), {
            preserveState: true,
            preserveScroll: true,
            replace: true,
        });
    };

    const applyFilters = (next: Partial<Filters>, submit = false) => {
        const merged = { ...localFilters, ...next };
        setLocalFilters(merged);

        if (submit) {
            visitWithFilters(merged);
        }
    };

    const applyPreset = (preset: FilterPreset) => {
        const resolvedPresetDates = preset.filters.date_preset
            ? resolveDatePresetRange(preset.filters.date_preset)
            : null;
        const normalized: Filters = {
            workspace_ids: [...(preset.filters.workspace_ids ?? [])],
            note_scope_ids: [...(preset.filters.note_scope_ids ?? [])],
            date_preset: preset.filters.date_preset ?? '',
            date_from: resolvedPresetDates?.from ?? preset.filters.date_from ?? '',
            date_to: resolvedPresetDates?.to ?? preset.filters.date_to ?? '',
            status:
                preset.filters.status && preset.filters.status.length > 0
                    ? [...preset.filters.status]
                    : ['open'],
            group_by: preset.filters.group_by ?? 'none',
            q: preset.filters.q ?? '',
        };

        setLocalFilters(normalized);
        visitWithFilters(normalized);
    };

    const openSavePresetDialog = () => {
        setPresetName('');
        setPresetFavorite(false);
        setSavePresetOpen(true);
    };

    const setDefaultPreset = (preset: FilterPreset) => {
        router.patch(
            `/settings/task-filters/${preset.id}`,
            {
                name: preset.name,
                favorite: true,
                default: !preset.default,
            },
            { preserveState: true, preserveScroll: true, replace: true },
        );
    };

    const clearAppliedPreset = () => {
        router.get(
            '/tasks',
            {},
            {
                preserveState: false,
                preserveScroll: true,
                replace: true,
            },
        );
    };

    const saveCurrentFiltersPreset = () => {
        const name = presetName.trim();
        if (name === '' || presetProcessing) {
            return;
        }

        setPresetProcessing(true);
        const filtersToSave = localFilters.date_preset
            ? { ...localFilters, date_from: '', date_to: '' }
            : localFilters;

        router.post(
            '/tasks/filter-presets',
            {
                name,
                favorite: presetFavorite,
                filters: filtersToSave,
            },
            {
                preserveState: true,
                preserveScroll: true,
                replace: true,
                onSuccess: () => {
                    setSavePresetOpen(false);
                    setPresetName('');
                    setPresetFavorite(false);
                    toast.success(t('tasks_index.filter_preset_saved', 'Filter saved.'));
                },
                onFinish: () => {
                    setPresetProcessing(false);
                },
            },
        );
    };

    const parseDate = (value: string): Date | undefined => {
        if (!value) {
            return undefined;
        }

        return parseISO(value);
    };

    const selectedDateRange: DateRange = {
        from: parseDate(localFilters.date_from),
        to: parseDate(localFilters.date_to),
    };

    const formatDateRangeLabel = () => {
        if (localFilters.date_preset) {
            const presetLabel = datePresetOptions.find(
                (option) => option.value === localFilters.date_preset,
            )?.label;

            if (presetLabel) {
                return presetLabel;
            }
        }

        if (selectedDateRange.from && selectedDateRange.to) {
            return `${format(selectedDateRange.from, 'PPP', { locale: dateLocale })} - ${format(selectedDateRange.to, 'PPP', { locale: dateLocale })}`;
        }

        if (selectedDateRange.from) {
            return t('tasks_index.date_from_label', 'From :date').replace(
                ':date',
                format(selectedDateRange.from, 'PPP', { locale: dateLocale }),
            );
        }

        return t('tasks_index.date_range_label', 'Date range (due + deadline)');
    };

    const hasDateFilterSelection = Boolean(
        localFilters.date_preset || localFilters.date_from || localFilters.date_to,
    );

    const selectedNoteScopeSet = useMemo(
        () => new Set(localFilters.note_scope_ids),
        [localFilters.note_scope_ids],
    );

    const selectedWorkspaceSet = useMemo(
        () => new Set(localFilters.workspace_ids),
        [localFilters.workspace_ids],
    );

    const toggleWorkspaceSelection = (workspaceId: string) => {
        const checked = selectedWorkspaceSet.has(workspaceId);
        const next = checked
            ? localFilters.workspace_ids.filter((id) => id !== workspaceId)
            : [...localFilters.workspace_ids, workspaceId];

        applyFilters({ workspace_ids: next, note_scope_ids: [] }, true);
    };

    const toggleSingleNoteScope = (id: string) => {
        const next = selectedNoteScopeSet.has(id)
            ? localFilters.note_scope_ids.filter((value) => value !== id)
            : [...localFilters.note_scope_ids, id];

        applyFilters({ note_scope_ids: next }, true);
    };

    return {
        // state
        localFilters,
        setLocalFilters,
        savePresetOpen,
        setSavePresetOpen,
        presetName,
        setPresetName,
        presetFavorite,
        setPresetFavorite,
        presetProcessing,
        // derived sets
        selectedNoteScopeSet,
        selectedWorkspaceSet,
        // option lists
        statusOptions,
        statusSelectionLabels,
        groupingOptions,
        groupingSelectionLabel,
        datePresetOptions,
        // computed
        activeFilterPreset,
        selectedDateRange,
        hasDateFilterSelection,
        // functions
        normalizeFilterState,
        filterSignature,
        toQuery,
        visitWithFilters,
        applyFilters,
        applyPreset,
        clearAppliedPreset,
        setDefaultPreset,
        openSavePresetDialog,
        saveCurrentFiltersPreset,
        resolveDatePresetRange,
        formatDateRangeLabel,
        toggleWorkspaceSelection,
        toggleSingleNoteScope,
    };
}
