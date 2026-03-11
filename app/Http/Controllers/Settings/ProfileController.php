<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use App\Http\Requests\Settings\ProfileDeleteRequest;
use App\Http\Requests\Settings\ProfileUpdateRequest;
use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class ProfileController extends Controller
{
    /**
     * Show the user's profile settings page.
     */
    public function edit(Request $request): Response
    {
        return Inertia::render('settings/profile', [
            'mustVerifyEmail' => $request->user() instanceof MustVerifyEmail,
            'status' => $request->session()->get('status'),
            'language' => $request->user()?->languagePreference() ?? 'nl',
            'dateLongFormat' => $request->user()?->longDateFormatPreference() ?? 'weekday_day_month_year',
            'dateShortFormat' => $request->user()?->shortDateFormatPreference() ?? 'weekday_day_month_short_year',
            'timeFormat' => $request->user()?->timeFormatPreference() ?? '24h',
        ]);
    }

    /**
     * Update the user's profile information.
     */
    public function update(ProfileUpdateRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $request->user()->fill(Arr::only($validated, ['name', 'email']));

        if ($request->user()->isDirty('email')) {
            $request->user()->email_verified_at = null;
        }

        $settings = is_array($request->user()->settings) ? $request->user()->settings : [];

        if (isset($validated['language'])) {
            $settings['language'] = $validated['language'];
        }
        if (isset($validated['date_long_format'])) {
            $settings['date_long_format'] = $validated['date_long_format'];
        }
        if (isset($validated['date_short_format'])) {
            $settings['date_short_format'] = $validated['date_short_format'];
        }
        if (isset($validated['time_format'])) {
            $settings['time_format'] = $validated['time_format'];
        }

        $request->user()->settings = $settings;

        $request->user()->save();

        return to_route('profile.edit');
    }

    /**
     * Delete the user's profile.
     */
    public function destroy(ProfileDeleteRequest $request): RedirectResponse
    {
        $user = $request->user();

        Auth::logout();

        $user->delete();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    }
}
