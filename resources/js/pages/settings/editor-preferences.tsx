import { Head, useForm } from '@inertiajs/react';
import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import {
    COLOR_SWATCH_BG_CLASS,
    COLOR_SWATCH_OPTIONS,
} from '@/components/color-swatch-picker';
import Heading from '@/components/heading';
import { IconPicker } from '@/components/icon-picker';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { useI18n } from '@/lib/i18n';
import { edit as editEditorPreferences } from '@/routes/editor-preferences';
import type { BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Editor preferences',
        href: editEditorPreferences(),
    },
];

const JOURNAL_ICON_DEFAULTS = {
    daily: 'calendar_days',
    weekly: 'calendar_range',
    monthly: 'calendar_sync',
    yearly: 'calendar_1',
} as const;
const JOURNAL_ICON_DEFAULT_COLOR = 'black' as const;

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

const JOURNAL_ICON_CONFIG: Array<{
    key: JournalIconKey;
    labelKey: string;
    labelFallback: string;
    iconField: JournalIconField;
    colorField: JournalIconColorField;
}> = [
    {
        key: 'daily',
        labelKey: 'editor_preferences.daily',
        labelFallback: 'Daily',
        iconField: 'journal_daily_icon',
        colorField: 'journal_daily_icon_color',
    },
    {
        key: 'weekly',
        labelKey: 'editor_preferences.weekly',
        labelFallback: 'Weekly',
        iconField: 'journal_weekly_icon',
        colorField: 'journal_weekly_icon_color',
    },
    {
        key: 'monthly',
        labelKey: 'editor_preferences.monthly',
        labelFallback: 'Monthly',
        iconField: 'journal_monthly_icon',
        colorField: 'journal_monthly_icon_color',
    },
    {
        key: 'yearly',
        labelKey: 'editor_preferences.yearly',
        labelFallback: 'Yearly',
        iconField: 'journal_yearly_icon',
        colorField: 'journal_yearly_icon_color',
    },
];

type Props = {
    preferences: {
        sidebar_left_open_default: boolean;
        sidebar_right_open_default: boolean;
        journal_daily_icon: string;
        journal_weekly_icon: string;
        journal_monthly_icon: string;
        journal_yearly_icon: string;
        journal_daily_icon_color: string;
        journal_weekly_icon_color: string;
        journal_monthly_icon_color: string;
        journal_yearly_icon_color: string;
    };
};

export default function EditorPreferences({ preferences }: Props) {
    const { t } = useI18n();
    const [openColorPicker, setOpenColorPicker] = useState<JournalIconKey | null>(null);

    const form = useForm({
        sidebar_left_open_default: preferences.sidebar_left_open_default,
        sidebar_right_open_default: preferences.sidebar_right_open_default,
        journal_daily_icon: preferences.journal_daily_icon,
        journal_weekly_icon: preferences.journal_weekly_icon,
        journal_monthly_icon: preferences.journal_monthly_icon,
        journal_yearly_icon: preferences.journal_yearly_icon,
        journal_daily_icon_color: preferences.journal_daily_icon_color,
        journal_weekly_icon_color: preferences.journal_weekly_icon_color,
        journal_monthly_icon_color: preferences.journal_monthly_icon_color,
        journal_yearly_icon_color: preferences.journal_yearly_icon_color,
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
                        </div>

                        <div className="space-y-4">
                            <Heading
                                variant="small"
                                title={t('editor_preferences.journal_sidebar_icons_title', 'Journal sidebar icons')}
                                description={t('editor_preferences.journal_sidebar_icons_description', 'Personalize sidebar icons (and colors) for daily, weekly, monthly and yearly notes.')}
                            />

                            <div className="space-y-4 px-4">
                                {JOURNAL_ICON_CONFIG.map((config) => {
                                    const selectedColor = (
                                        form.data[config.colorField] || 'black'
                                    ) as keyof typeof COLOR_SWATCH_BG_CLASS;
                                    const swatchClass =
                                        COLOR_SWATCH_BG_CLASS[selectedColor] ??
                                        COLOR_SWATCH_BG_CLASS.black;

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
                                                                        className={`relative h-7 w-7 rounded-full border border-border/70 p-[2px] ${swatchClass} after:absolute after:inset-[2px] after:rounded-full after:content-['']`}
                                                                        aria-hidden="true"
                                                                    />
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
                                                        <div className="flex flex-wrap gap-2">
                                                            {COLOR_SWATCH_OPTIONS.map((color) => (
                                                                <button
                                                                    key={color}
                                                                    type="button"
                                                                    className={`relative h-7 w-7 rounded-full border border-border/70 p-[2px] transition ${
                                                                        COLOR_SWATCH_BG_CLASS[
                                                                            color
                                                                        ]
                                                                    } after:absolute after:inset-[2px] after:rounded-full after:content-[''] ${
                                                                        form.data[
                                                                            config.colorField
                                                                        ] ===
                                                                        color
                                                                            ? 'border-foreground'
                                                                            : 'hover:border-foreground/40'
                                                                    } ${
                                                                        form.data[
                                                                            config.colorField
                                                                        ] ===
                                                                        color
                                                                            ? 'after:border after:border-white after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]'
                                                                            : ''
                                                                    }`}
                                                                    aria-label={`Set color to ${color}`}
                                                                    onClick={() => {
                                                                        form.setData(
                                                                            config.colorField,
                                                                            color,
                                                                        );
                                                                        setOpenColorPicker(
                                                                            null,
                                                                        );
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
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

                        <Button type="submit" disabled={form.processing}>
                            {t('editor_preferences.save_preferences', 'Save preferences')}
                        </Button>
                    </form>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}
