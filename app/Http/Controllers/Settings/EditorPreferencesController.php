<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class EditorPreferencesController extends Controller
{
    private const COLOR_DEFAULT = 'default';

    private const COLOR_OPTIONS = [
        'default',
        'black',
        'slate',
        'zinc',
        'stone',
        'red',
        'orange',
        'amber',
        'yellow',
        'lime',
        'green',
        'emerald',
        'teal',
        'cyan',
        'sky',
        'blue',
        'indigo',
        'violet',
        'purple',
        'fuchsia',
        'pink',
        'rose',
    ];

    private const JOURNAL_ICON_DEFAULTS = [
        'daily' => 'calendar',
        'weekly' => 'calendar',
        'monthly' => 'calendar_days',
        'yearly' => 'calendar',
    ];

    private const JOURNAL_ICON_LEGACY_DEFAULTS = [
        'daily' => 'calendar_days',
        'weekly' => 'calendar_range',
        'monthly' => 'calendar_sync',
        'yearly' => 'calendar_1',
    ];

    private const SIDEBAR_ICON_DEFAULTS = [
        'notes' => 'notebook_tabs',
        'tasks' => 'check_check',
    ];

    public function edit(Request $request): Response
    {
        $settings = is_array($request->user()?->settings) ? $request->user()?->settings : [];

        return Inertia::render('settings/editor-preferences', [
            'preferences' => [
                'sidebar_left_open_default' => (bool) data_get($settings, 'editor.sidebar_left_open_default', true),
                'sidebar_right_open_default' => (bool) data_get($settings, 'editor.sidebar_right_open_default', true),
                'timeblock_default_duration_minutes' => (int) data_get($settings, 'editor.timeblock_default_duration_minutes', 60),
                'journal_daily_icon' => $this->normalizeDisplayedJournalIcon('daily', (string) data_get($settings, 'editor.journal_icons.daily', self::JOURNAL_ICON_DEFAULTS['daily'])),
                'journal_weekly_icon' => $this->normalizeDisplayedJournalIcon('weekly', (string) data_get($settings, 'editor.journal_icons.weekly', self::JOURNAL_ICON_DEFAULTS['weekly'])),
                'journal_monthly_icon' => $this->normalizeDisplayedJournalIcon('monthly', (string) data_get($settings, 'editor.journal_icons.monthly', self::JOURNAL_ICON_DEFAULTS['monthly'])),
                'journal_yearly_icon' => $this->normalizeDisplayedJournalIcon('yearly', (string) data_get($settings, 'editor.journal_icons.yearly', self::JOURNAL_ICON_DEFAULTS['yearly'])),
                'sidebar_notes_icon' => (string) data_get($settings, 'editor.sidebar_icons.notes', self::SIDEBAR_ICON_DEFAULTS['notes']),
                'sidebar_tasks_icon' => (string) data_get($settings, 'editor.sidebar_icons.tasks', self::SIDEBAR_ICON_DEFAULTS['tasks']),
                'journal_daily_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.daily', self::COLOR_DEFAULT)),
                'journal_weekly_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.weekly', self::COLOR_DEFAULT)),
                'journal_monthly_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.monthly', self::COLOR_DEFAULT)),
                'journal_yearly_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.yearly', self::COLOR_DEFAULT)),
                'sidebar_notes_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.sidebar_icon_colors.notes', self::COLOR_DEFAULT)),
                'sidebar_tasks_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.sidebar_icon_colors.tasks', self::COLOR_DEFAULT)),
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'sidebar_left_open_default' => ['required', 'boolean'],
            'sidebar_right_open_default' => ['required', 'boolean'],
            'timeblock_default_duration_minutes' => ['required', 'integer', 'min:5', 'max:720'],
            'journal_daily_icon' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_weekly_icon' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_monthly_icon' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_yearly_icon' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'sidebar_notes_icon' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'sidebar_tasks_icon' => ['nullable', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_daily_icon_color' => ['nullable', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'journal_weekly_icon_color' => ['nullable', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'journal_monthly_icon_color' => ['nullable', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'journal_yearly_icon_color' => ['nullable', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'sidebar_notes_icon_color' => ['nullable', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'sidebar_tasks_icon_color' => ['nullable', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
        ]);

        $user = $request->user();
        $settings = is_array($user?->settings) ? $user->settings : [];

        $journalIcons = [
            'daily' => $this->normalizeIconName((string) ($validated['journal_daily_icon'] ?? data_get($settings, 'editor.journal_icons.daily', self::JOURNAL_ICON_DEFAULTS['daily']))),
            'weekly' => $this->normalizeIconName((string) ($validated['journal_weekly_icon'] ?? data_get($settings, 'editor.journal_icons.weekly', self::JOURNAL_ICON_DEFAULTS['weekly']))),
            'monthly' => $this->normalizeIconName((string) ($validated['journal_monthly_icon'] ?? data_get($settings, 'editor.journal_icons.monthly', self::JOURNAL_ICON_DEFAULTS['monthly']))),
            'yearly' => $this->normalizeIconName((string) ($validated['journal_yearly_icon'] ?? data_get($settings, 'editor.journal_icons.yearly', self::JOURNAL_ICON_DEFAULTS['yearly']))),
        ];

        $sidebarIcons = [
            'notes' => $this->normalizeIconName((string) ($validated['sidebar_notes_icon'] ?? data_get($settings, 'editor.sidebar_icons.notes', self::SIDEBAR_ICON_DEFAULTS['notes']))),
            'tasks' => $this->normalizeIconName((string) ($validated['sidebar_tasks_icon'] ?? data_get($settings, 'editor.sidebar_icons.tasks', self::SIDEBAR_ICON_DEFAULTS['tasks']))),
        ];

        $journalIconColors = [
            'daily' => $this->normalizeColorName((string) ($validated['journal_daily_icon_color'] ?? data_get($settings, 'editor.journal_icon_colors.daily', self::COLOR_DEFAULT))),
            'weekly' => $this->normalizeColorName((string) ($validated['journal_weekly_icon_color'] ?? data_get($settings, 'editor.journal_icon_colors.weekly', self::COLOR_DEFAULT))),
            'monthly' => $this->normalizeColorName((string) ($validated['journal_monthly_icon_color'] ?? data_get($settings, 'editor.journal_icon_colors.monthly', self::COLOR_DEFAULT))),
            'yearly' => $this->normalizeColorName((string) ($validated['journal_yearly_icon_color'] ?? data_get($settings, 'editor.journal_icon_colors.yearly', self::COLOR_DEFAULT))),
        ];

        $sidebarIconColors = [
            'notes' => $this->normalizeColorName((string) ($validated['sidebar_notes_icon_color'] ?? data_get($settings, 'editor.sidebar_icon_colors.notes', self::COLOR_DEFAULT))),
            'tasks' => $this->normalizeColorName((string) ($validated['sidebar_tasks_icon_color'] ?? data_get($settings, 'editor.sidebar_icon_colors.tasks', self::COLOR_DEFAULT))),
        ];

        data_set($settings, 'editor.sidebar_left_open_default', (bool) $validated['sidebar_left_open_default']);
        data_set($settings, 'editor.sidebar_right_open_default', (bool) $validated['sidebar_right_open_default']);
        data_set($settings, 'editor.timeblock_default_duration_minutes', (int) $validated['timeblock_default_duration_minutes']);
        data_set($settings, 'editor.journal_icons.daily', $journalIcons['daily']);
        data_set($settings, 'editor.journal_icons.weekly', $journalIcons['weekly']);
        data_set($settings, 'editor.journal_icons.monthly', $journalIcons['monthly']);
        data_set($settings, 'editor.journal_icons.yearly', $journalIcons['yearly']);
        data_set($settings, 'editor.sidebar_icons.notes', $sidebarIcons['notes']);
        data_set($settings, 'editor.sidebar_icons.tasks', $sidebarIcons['tasks']);
        data_set($settings, 'editor.journal_icon_colors.daily', $journalIconColors['daily']);
        data_set($settings, 'editor.journal_icon_colors.weekly', $journalIconColors['weekly']);
        data_set($settings, 'editor.journal_icon_colors.monthly', $journalIconColors['monthly']);
        data_set($settings, 'editor.journal_icon_colors.yearly', $journalIconColors['yearly']);
        data_set($settings, 'editor.sidebar_icon_colors.notes', $sidebarIconColors['notes']);
        data_set($settings, 'editor.sidebar_icon_colors.tasks', $sidebarIconColors['tasks']);

        $user?->forceFill([
            'settings' => $settings,
        ])->save();

        return to_route('editor-preferences.edit');
    }

    private function normalizeIconName(string $icon): string
    {
        return str_replace('-', '_', strtolower(trim($icon)));
    }

    private function normalizeColorName(string $color): string
    {
        $normalized = strtolower(trim($color));

        if (!in_array($normalized, self::COLOR_OPTIONS, true)) {
            return self::COLOR_DEFAULT;
        }

        return $normalized;
    }

    private function normalizeDisplayedJournalIcon(string $granularity, string $icon): string
    {
        $normalized = $this->normalizeIconName($icon);
        $legacyDefault = self::JOURNAL_ICON_LEGACY_DEFAULTS[$granularity] ?? null;
        $currentDefault = self::JOURNAL_ICON_DEFAULTS[$granularity] ?? self::JOURNAL_ICON_DEFAULTS['daily'];

        if ($legacyDefault !== null && $normalized === $legacyDefault) {
            return $currentDefault;
        }

        return $normalized !== '' ? $normalized : $currentDefault;
    }
}
