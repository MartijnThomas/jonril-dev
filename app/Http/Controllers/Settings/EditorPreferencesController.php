<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class EditorPreferencesController extends Controller
{
    public function edit(Request $request): Response
    {
        $settings = is_array($request->user()?->settings) ? $request->user()?->settings : [];

        return Inertia::render('settings/editor-preferences', [
            'preferences' => [
                'sidebar_left_open_default' => (bool) data_get($settings, 'editor.sidebar_left_open_default', true),
                'sidebar_right_open_default' => (bool) data_get($settings, 'editor.sidebar_right_open_default', true),
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'sidebar_left_open_default' => ['required', 'boolean'],
            'sidebar_right_open_default' => ['required', 'boolean'],
        ]);

        $user = $request->user();
        $settings = is_array($user?->settings) ? $user->settings : [];

        data_set($settings, 'editor.sidebar_left_open_default', (bool) $validated['sidebar_left_open_default']);
        data_set($settings, 'editor.sidebar_right_open_default', (bool) $validated['sidebar_right_open_default']);

        $user?->forceFill([
            'settings' => $settings,
        ])->save();

        return to_route('editor-preferences.edit');
    }
}
