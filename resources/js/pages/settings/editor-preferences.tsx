import { Head, useForm } from '@inertiajs/react';
import { Calendar, CalendarDays, RotateCcw } from 'lucide-react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import {
    ColorSwatchPicker,
    getColorSwatchPreviewClasses,
} from '@/components/color-swatch-picker';
import Heading from '@/components/heading';
import { IconPicker } from '@/components/icon-picker';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { edit as editEditorPreferences } from '@/routes/editor-preferences';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Editor preferences',
        href: editEditorPreferences(),
    },
];

const JOURNAL_ICON_DEFAULTS = {
    daily: 'calendar',
    weekly: 'calendar',
    monthly: 'calendar_days',
    yearly: 'calendar',
} as const;
const SIDEBAR_ICON_DEFAULTS = {
    notes: 'notebook_tabs',
    tasks: 'check_check',
} as const;
const JOURNAL_ICON_DEFAULT_COLOR = 'default' as const;
const SIDEBAR_ICON_DEFAULT_COLOR = 'default' as const;

type JournalIconKey = keyof typeof JOURNAL_ICON_DEFAULTS;
type JournalIconField =
    | 'journal_daily_icon'
    | 'journal_weekly_icon'
    | 'journal_monthly_icon'
    | 'journal_yearly_icon';
type JournalIconColorField =
    | 'journal_daily_icon_color'
    | 'journal_weekly_icon_color'
    | 'journal_monthly_icon_color'
    | 'journal_yearly_icon_color';
type SidebarIconKey = keyof typeof SIDEBAR_ICON_DEFAULTS;
type SidebarIconField = 'sidebar_notes_icon' | 'sidebar_tasks_icon';
type SidebarIconColorField = 'sidebar_notes_icon_color' | 'sidebar_tasks_icon_color';

const JOURNAL_ICON_CONFIG: Array<{
    key: JournalIconKey;
    labelKey: string;
    labelFallback: string;
    iconField: JournalIconField;
    colorField: JournalIconColorField;
    defaultOptionLabelKey: string;
    defaultOptionLabelFallback: string;
}> = [
    {
        key: 'daily',
        labelKey: 'editor_preferences.daily',
        labelFallback: 'Daily',
        iconField: 'journal_daily_icon',
        colorField: 'journal_daily_icon_color',
        defaultOptionLabelKey: 'editor_preferences.default_daily_icon_option',
        defaultOptionLabelFallback: 'Default (Calendar + day)',
    },
    {
        key: 'weekly',
        labelKey: 'editor_preferences.weekly',
        labelFallback: 'Weekly',
        iconField: 'journal_weekly_icon',
        colorField: 'journal_weekly_icon_color',
        defaultOptionLabelKey: 'editor_preferences.default_weekly_icon_option',
        defaultOptionLabelFallback: 'Default (Calendar + W)',
    },
    {
        key: 'monthly',
        labelKey: 'editor_preferences.monthly',
        labelFallback: 'Monthly',
        iconField: 'journal_monthly_icon',
        colorField: 'journal_monthly_icon_color',
        defaultOptionLabelKey: 'editor_preferences.default_monthly_icon_option',
        defaultOptionLabelFallback: 'Default (Calendar days)',
    },
    {
        key: 'yearly',
        labelKey: 'editor_preferences.yearly',
        labelFallback: 'Yearly',
        iconField: 'journal_yearly_icon',
        colorField: 'journal_yearly_icon_color',
        defaultOptionLabelKey: 'editor_preferences.default_yearly_icon_option',
        defaultOptionLabelFallback: 'Default (Calendar + Y)',
    },
];

const SIDEBAR_ICON_CONFIG: Array<{
    key: SidebarIconKey;
    labelKey: string;
    labelFallback: string;
    iconField: SidebarIconField;
    colorField: SidebarIconColorField;
}> = [
    {
        key: 'notes',
        labelKey: 'editor_preferences.notes',
        labelFallback: 'Notes',
        iconField: 'sidebar_notes_icon',
        colorField: 'sidebar_notes_icon_color',
    },
    {
        key: 'tasks',
        labelKey: 'editor_preferences.tasks',
        labelFallback: 'Tasks',
        iconField: 'sidebar_tasks_icon',
        colorField: 'sidebar_tasks_icon_color',
    },
];

type Props = {
    preferences: {
        sidebar_left_open_default: boolean;
        sidebar_right_open_default: boolean;
        timeblock_default_duration_minutes: number;
        journal_daily_icon: string;
        journal_weekly_icon: string;
        journal_monthly_icon: string;
        journal_yearly_icon: string;
        journal_daily_icon_color: string;
        journal_weekly_icon_color: string;
        journal_monthly_icon_color: string;
        journal_yearly_icon_color: string;
        sidebar_notes_icon: string;
        sidebar_tasks_icon: string;
        sidebar_notes_icon_color: string;
        sidebar_tasks_icon_color: string;
    };
};

function CalendarBadgeIcon({
    className,
    badge,
}: {
    className?: string;
    badge: string;
}) {
    return (
        <span className={cn('relative inline-flex h-4 w-4 items-center justify-center', className)}>
            <Calendar className="size-4" />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] leading-none font-medium">
                {badge}
            </span>
        </span>
    );
}

function MonthlyDefaultIcon({ className }: { className?: string }) {
    return <CalendarDays className={className} />;
}

export default function EditorPreferences({ preferences }: Props) {
    const { t } = useI18n();
    const dayBadge = String(new Date().getDate());
    const [openColorPicker, setOpenColorPicker] = useState<
        JournalIconKey | SidebarIconKey | null
    >(null);

    const form = useForm({
        sidebar_left_open_default: preferences.sidebar_left_open_default,
        sidebar_right_open_default: preferences.sidebar_right_open_default,
        timeblock_default_duration_minutes: preferences.timeblock_default_duration_minutes,
        journal_daily_icon: preferences.journal_daily_icon,
        journal_weekly_icon: preferences.journal_weekly_icon,
        journal_monthly_icon: preferences.journal_monthly_icon,
        journal_yearly_icon: preferences.journal_yearly_icon,
        journal_daily_icon_color: preferences.journal_daily_icon_color,
        journal_weekly_icon_color: preferences.journal_weekly_icon_color,
        journal_monthly_icon_color: preferences.journal_monthly_icon_color,
        journal_yearly_icon_color: preferences.journal_yearly_icon_color,
        sidebar_notes_icon: preferences.sidebar_notes_icon,
        sidebar_tasks_icon: preferences.sidebar_tasks_icon,
        sidebar_notes_icon_color: preferences.sidebar_notes_icon_color,
        sidebar_tasks_icon_color: preferences.sidebar_tasks_icon_color,
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('editor_preferences.title', 'Editor preferences')} />

            <h1 className="sr-only">{t('editor_preferences.title', 'Editor preferences')}</h1>

            <SettingsLayout>
                <div className="space-y-6">
                    <Heading
                        variant="small"
                        title={t('editor_preferences.sidebar_behaviour_title', 'Sidebar behaviour')}
                        description={t('editor_preferences.sidebar_behaviour_description', 'Set default sidebar behavior for the editor layout.')}
                    />

                    <form
                        className="space-y-6"
                        onSubmit={(event) => {
                            event.preventDefault();
                            form.patch('/settings/editor-preferences', {
                                preserveScroll: true,
                                onSuccess: () => {
                                    document.cookie = `sidebar_state=${form.data.sidebar_left_open_default}; path=/; max-age=${60 * 60 * 24 * 7}`;
                                    document.cookie = `right_sidebar_state=${form.data.sidebar_right_open_default}; path=/; max-age=${60 * 60 * 24 * 7}`;
                                },
                            });
                        }}
                    >
                        <div className="space-y-2 px-4">
                            <div className="flex items-center justify-between py-2">
                                <div>
                                    <Label htmlFor="sidebar-left-default">
                                        {t('editor_preferences.left_sidebar_label', 'Left sidebar')}
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        {t('editor_preferences.left_sidebar_description', 'Open left sidebar by default.')}
                                    </p>
                                </div>
                                <Switch
                                    id="sidebar-left-default"
                                    checked={form.data.sidebar_left_open_default}
                                    onCheckedChange={(checked) =>
                                        form.setData('sidebar_left_open_default', checked)
                                    }
                                />
                            </div>

                            <div className="flex items-center justify-between py-2">
                                <div>
                                    <Label htmlFor="sidebar-right-default">
                                        {t('editor_preferences.right_sidebar_label', 'Right sidebar')}
                                    </Label>
                                    <p className="text-sm text-muted-foreground">
                                        {t('editor_preferences.right_sidebar_description', 'Open right sidebar by default.')}
                                    </p>
                                </div>
                                <Switch
                                    id="sidebar-right-default"
                                    checked={form.data.sidebar_right_open_default}
                                    onCheckedChange={(checked) =>
                                        form.setData('sidebar_right_open_default', checked)
                                    }
                                />
                            </div>

                            <div className="space-y-2 py-2">
                                <Label htmlFor="timeblock-default-duration">
                                    {t('editor_preferences.timeblock_default_duration_label', 'Default timeblock duration (minutes)')}
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {t('editor_preferences.timeblock_default_duration_description', 'Used when a timeblock has only a start time, for example `10:00 Planning`.')}
                                </p>
                                <Input
                                    id="timeblock-default-duration"
                                    type="number"
                                    min={5}
                                    max={720}
                                    step={5}
                                    value={form.data.timeblock_default_duration_minutes}
                                    onChange={(event) =>
                                        form.setData(
                                            'timeblock_default_duration_minutes',
                                            Number(event.target.value || 60),
                                        )
                                    }
                                    className="max-w-[200px]"
                                />
                                <InputError message={form.errors.timeblock_default_duration_minutes} />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Heading
                                variant="small"
                                title={t('editor_preferences.journal_sidebar_icons_title', 'Journal sidebar icons')}
                                description={t('editor_preferences.journal_sidebar_icons_description', 'Personalize sidebar icons (and colors) for daily, weekly, monthly and yearly notes.')}
                            />

                            <div className="space-y-4 px-4">
                                {JOURNAL_ICON_CONFIG.map((config) => {
                                    const swatchPreview =
                                        getColorSwatchPreviewClasses(
                                            form.data[config.colorField] || JOURNAL_ICON_DEFAULT_COLOR,
                                        );
                                    const defaultOptionIcon: ComponentType<{ className?: string }> =
                                        config.key === 'monthly'
                                            ? MonthlyDefaultIcon
                                            : ({ className }: { className?: string }) => (
                                                  <CalendarBadgeIcon
                                                      className={className}
                                                      badge={
                                                          config.key === 'daily'
                                                              ? dayBadge
                                                              : config.key === 'weekly'
                                                                ? 'W'
                                                                : 'Y'
                                                      }
                                                  />
                                              );

                                    return (
                                        <div key={config.key} className="space-y-3">
                                            <div className="grid items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto_auto]">
                                                <Label>{t(config.labelKey, config.labelFallback)}</Label>

                                                <div className="min-w-0">
                                                    <IconPicker
                                                        value={
                                                            form.data[
                                                                config.iconField
                                                            ]
                                                        }
                                                        fallbackValue={
                                                            JOURNAL_ICON_DEFAULTS[
                                                                config.key
                                                            ]
                                                        }
                                                        onValueChange={(icon) =>
                                                            form.setData(
                                                                config.iconField,
                                                                icon,
                                                            )
                                                        }
                                                        prependOptions={[
                                                            {
                                                                value: JOURNAL_ICON_DEFAULTS[config.key],
                                                                label: t(
                                                                    config.defaultOptionLabelKey,
                                                                    config.defaultOptionLabelFallback,
                                                                ),
                                                                icon: defaultOptionIcon,
                                                            },
                                                        ]}
                                                    />
                                                </div>

                                                <Popover
                                                    open={openColorPicker === config.key}
                                                    onOpenChange={(open) =>
                                                        setOpenColorPicker(
                                                            open
                                                                ? config.key
                                                                : null,
                                                        )
                                                    }
                                                >
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <PopoverTrigger asChild>
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center p-0"
                                                                    aria-label={t('editor_preferences.pick_color', 'Pick color')}
                                                                >
                                                                    <span
                                                                        className="relative h-7 w-7 rounded-full border border-border/70"
                                                                        aria-hidden="true"
                                                                    >
                                                                        <span className="absolute inset-[2px] grid grid-cols-2 overflow-hidden rounded-full">
                                                                            <span className={swatchPreview.light} />
                                                                            <span className={swatchPreview.dark} />
                                                                        </span>
                                                                    </span>
                                                                </button>
                                                            </PopoverTrigger>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            {t('editor_preferences.pick_color', 'Pick color')}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                    <PopoverContent
                                                        align="end"
                                                        className="w-64 space-y-2 p-3"
                                                        onCloseAutoFocus={(event) =>
                                                            event.preventDefault()
                                                        }
                                                    >
                                                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                            {t('editor_preferences.icon_color', 'Icon color')}
                                                        </p>
                                                        <ColorSwatchPicker
                                                            value={form.data[config.colorField]}
                                                            includeDefault
                                                            defaultValue={JOURNAL_ICON_DEFAULT_COLOR}
                                                            defaultLabel={t('editor_preferences.template_color', 'Template color')}
                                                            onValueChange={(value) => {
                                                                form.setData(config.colorField, value);
                                                                setOpenColorPicker(null);
                                                            }}
                                                        />
                                                    </PopoverContent>
                                                </Popover>

                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                                            aria-label={t('editor_preferences.back_to_default', 'Back to default')}
                                                            onClick={() => {
                                                                form.setData(
                                                                    config.iconField,
                                                                    JOURNAL_ICON_DEFAULTS[
                                                                        config.key
                                                                    ],
                                                                );
                                                                form.setData(
                                                                    config.colorField,
                                                                    JOURNAL_ICON_DEFAULT_COLOR,
                                                                );
                                                                setOpenColorPicker(
                                                                    null,
                                                                );
                                                            }}
                                                        >
                                                            <RotateCcw className="h-4 w-4" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                        {t('editor_preferences.back_to_default', 'Back to default')}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>

                                            <InputError
                                                message={
                                                    form.errors[config.iconField]
                                                }
                                            />
                                            <InputError
                                                message={
                                                    form.errors[
                                                        config.colorField
                                                    ]
                                                }
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Heading
                                variant="small"
                                title={t('editor_preferences.sidebar_menu_icons_title', 'Sidebar menu icons')}
                                description={t('editor_preferences.sidebar_menu_icons_description', 'Personalize sidebar icons (and colors) for Notes and Tasks.')}
                            />

                            <div className="space-y-4 px-4">
                                {SIDEBAR_ICON_CONFIG.map((config) => {
                                    const swatchPreview =
                                        getColorSwatchPreviewClasses(
                                            form.data[config.colorField] || SIDEBAR_ICON_DEFAULT_COLOR,
                                        );

                                    return (
                                        <div key={config.key} className="space-y-3">
                                            <div className="grid items-center gap-3 sm:grid-cols-[140px_minmax(0,1fr)_auto_auto]">
                                                <Label>{t(config.labelKey, config.labelFallback)}</Label>

                                                <div className="min-w-0">
                                                    <IconPicker
                                                        value={form.data[config.iconField]}
                                                        fallbackValue={SIDEBAR_ICON_DEFAULTS[config.key]}
                                                        onValueChange={(icon) => form.setData(config.iconField, icon)}
                                                    />
                                                </div>

                                                <Popover
                                                    open={openColorPicker === config.key}
                                                    onOpenChange={(open) =>
                                                        setOpenColorPicker(open ? config.key : null)
                                                    }
                                                >
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <PopoverTrigger asChild>
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center p-0"
                                                                    aria-label={t('editor_preferences.pick_color', 'Pick color')}
                                                                >
                                                                    <span
                                                                        className="relative h-7 w-7 rounded-full border border-border/70"
                                                                        aria-hidden="true"
                                                                    >
                                                                        <span className="absolute inset-[2px] grid grid-cols-2 overflow-hidden rounded-full">
                                                                            <span className={swatchPreview.light} />
                                                                            <span className={swatchPreview.dark} />
                                                                        </span>
                                                                    </span>
                                                                </button>
                                                            </PopoverTrigger>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top">
                                                            {t('editor_preferences.pick_color', 'Pick color')}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                    <PopoverContent
                                                        align="end"
                                                        className="w-64 space-y-2 p-3"
                                                        onCloseAutoFocus={(event) =>
                                                            event.preventDefault()
                                                        }
                                                    >
                                                        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                                            {t('editor_preferences.icon_color', 'Icon color')}
                                                        </p>
                                                        <ColorSwatchPicker
                                                            value={form.data[config.colorField]}
                                                            includeDefault
                                                            defaultValue={SIDEBAR_ICON_DEFAULT_COLOR}
                                                            defaultLabel={t('editor_preferences.template_color', 'Template color')}
                                                            onValueChange={(value) => {
                                                                form.setData(config.colorField, value);
                                                                setOpenColorPicker(null);
                                                            }}
                                                        />
                                                    </PopoverContent>
                                                </Popover>

                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                                            aria-label={t('editor_preferences.back_to_default', 'Back to default')}
                                                            onClick={() => {
                                                                form.setData(config.iconField, SIDEBAR_ICON_DEFAULTS[config.key]);
                                                                form.setData(config.colorField, SIDEBAR_ICON_DEFAULT_COLOR);
                                                                setOpenColorPicker(null);
                                                            }}
                                                        >
                                                            <RotateCcw className="h-4 w-4" />
                                                        </button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">
                                                        {t('editor_preferences.back_to_default', 'Back to default')}
                                                    </TooltipContent>
                                                </Tooltip>
                                            </div>

                                            <InputError message={form.errors[config.iconField]} />
                                            <InputError message={form.errors[config.colorField]} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <Button type="submit" disabled={form.processing}>
                            {t('editor_preferences.save_preferences', 'Save preferences')}
                        </Button>
                    </form>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
