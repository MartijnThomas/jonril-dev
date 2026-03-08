<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class EditorPreferencesController extends Controller
{
    private const COLOR_DEFAULT = 'black';

    private const COLOR_OPTIONS = [
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
        'daily' => 'calendar_days',
        'weekly' => 'calendar_range',
        'monthly' => 'calendar_sync',
        'yearly' => 'calendar_1',
    ];

    public function edit(Request $request): Response
    {
        $settings = is_array($request->user()?->settings) ? $request->user()?->settings : [];

        return Inertia::render('settings/editor-preferences', [
            'preferences' => [
                'sidebar_left_open_default' => (bool) data_get($settings, 'editor.sidebar_left_open_default', true),
                'sidebar_right_open_default' => (bool) data_get($settings, 'editor.sidebar_right_open_default', true),
                'journal_daily_icon' => (string) data_get($settings, 'editor.journal_icons.daily', self::JOURNAL_ICON_DEFAULTS['daily']),
                'journal_weekly_icon' => (string) data_get($settings, 'editor.journal_icons.weekly', self::JOURNAL_ICON_DEFAULTS['weekly']),
                'journal_monthly_icon' => (string) data_get($settings, 'editor.journal_icons.monthly', self::JOURNAL_ICON_DEFAULTS['monthly']),
                'journal_yearly_icon' => (string) data_get($settings, 'editor.journal_icons.yearly', self::JOURNAL_ICON_DEFAULTS['yearly']),
                'journal_daily_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.daily', self::COLOR_DEFAULT)),
                'journal_weekly_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.weekly', self::COLOR_DEFAULT)),
                'journal_monthly_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.monthly', self::COLOR_DEFAULT)),
                'journal_yearly_icon_color' => $this->normalizeColorName((string) data_get($settings, 'editor.journal_icon_colors.yearly', self::COLOR_DEFAULT)),
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'sidebar_left_open_default' => ['required', 'boolean'],
            'sidebar_right_open_default' => ['required', 'boolean'],
            'journal_daily_icon' => ['required', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_weekly_icon' => ['required', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_monthly_icon' => ['required', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_yearly_icon' => ['required', 'string', 'regex:/^[a-z][a-z0-9_-]*$/'],
            'journal_daily_icon_color' => ['required', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'journal_weekly_icon_color' => ['required', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'journal_monthly_icon_color' => ['required', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
            'journal_yearly_icon_color' => ['required', 'string', 'in:'.implode(',', self::COLOR_OPTIONS)],
        ]);

        $user = $request->user();
        $settings = is_array($user?->settings) ? $user->settings : [];

        data_set($settings, 'editor.sidebar_left_open_default', (bool) $validated['sidebar_left_open_default']);
        data_set($settings, 'editor.sidebar_right_open_default', (bool) $validated['sidebar_right_open_default']);
        data_set($settings, 'editor.journal_icons.daily', $this->normalizeIconName($validated['journal_daily_icon']));
        data_set($settings, 'editor.journal_icons.weekly', $this->normalizeIconName($validated['journal_weekly_icon']));
        data_set($settings, 'editor.journal_icons.monthly', $this->normalizeIconName($validated['journal_monthly_icon']));
        data_set($settings, 'editor.journal_icons.yearly', $this->normalizeIconName($validated['journal_yearly_icon']));
        data_set($settings, 'editor.journal_icon_colors.daily', $this->normalizeColorName($validated['journal_daily_icon_color']));
        data_set($settings, 'editor.journal_icon_colors.weekly', $this->normalizeColorName($validated['journal_weekly_icon_color']));
        data_set($settings, 'editor.journal_icon_colors.monthly', $this->normalizeColorName($validated['journal_monthly_icon_color']));
        data_set($settings, 'editor.journal_icon_colors.yearly', $this->normalizeColorName($validated['journal_yearly_icon_color']));

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

        if ($normalized === 'default' || !in_array($normalized, self::COLOR_OPTIONS, true)) {
            return self::COLOR_DEFAULT;
        }

        return $normalized;
    }
}
