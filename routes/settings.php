<?php

use App\Http\Controllers\CalendarController;
use App\Http\Controllers\Settings\EditorPreferencesController;
use App\Http\Controllers\Settings\PasswordController;
use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\TaskFilterPresetController;
use App\Http\Controllers\Settings\TwoFactorAuthenticationController;
use App\Http\Controllers\WorkspaceController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
});

Route::middleware(['auth', 'verified'])->group(function () {
    Route::delete('settings/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');

    Route::get('settings/password', [PasswordController::class, 'edit'])->name('user-password.edit');

    Route::put('settings/password', [PasswordController::class, 'update'])
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::inertia('settings/appearance', 'settings/appearance')->name('appearance.edit');
    Route::get('settings/editor-preferences', [EditorPreferencesController::class, 'edit'])
        ->name('editor-preferences.edit');
    Route::patch('settings/editor-preferences', [EditorPreferencesController::class, 'update'])
        ->name('editor-preferences.update');
    Route::get('settings/task-filters', [TaskFilterPresetController::class, 'edit'])
        ->name('task-filter-presets.edit');
    Route::patch('settings/task-filters/{presetId}', [TaskFilterPresetController::class, 'update'])
        ->name('task-filter-presets.update');
    Route::delete('settings/task-filters/{presetId}', [TaskFilterPresetController::class, 'destroy'])
        ->name('task-filter-presets.destroy');

    Route::get('settings/two-factor', [TwoFactorAuthenticationController::class, 'show'])
        ->name('two-factor.show');

    Route::get('settings/workspaces/{workspace}', [WorkspaceController::class, 'edit'])
        ->name('workspaces.settings.edit');
    Route::get('settings/workspaces/{workspace}/data', [WorkspaceController::class, 'data'])
        ->name('workspaces.settings.data');
    Route::patch('settings/workspaces/{workspace}', [WorkspaceController::class, 'update'])
        ->name('workspaces.settings.update');
    Route::patch('settings/workspaces/{workspace}/timeblock-sync-target', [WorkspaceController::class, 'updateTimeblockSyncTarget'])
        ->name('workspaces.settings.timeblock-sync-target.update');
    Route::post('settings/workspaces/{workspace}/timeblock-sync-retry-failed', [WorkspaceController::class, 'retryFailedTimeblockSync'])
        ->name('workspaces.settings.timeblock-sync.retry-failed');
    Route::post('settings/workspaces/{workspace}/clear', [WorkspaceController::class, 'clear'])
        ->name('workspaces.settings.clear');
    Route::delete('settings/workspaces/{workspace}', [WorkspaceController::class, 'destroy'])
        ->name('workspaces.settings.destroy');
    Route::post('settings/workspaces/{workspace}/migrate', [WorkspaceController::class, 'migrateToBlock'])
        ->name('workspaces.settings.migrate');
    Route::post('settings/workspaces/{workspace}/reactivate', [WorkspaceController::class, 'reactivate'])
        ->name('workspaces.settings.reactivate');
    Route::post('settings/workspaces/{workspace}/members', [WorkspaceController::class, 'addMember'])
        ->name('workspaces.settings.members.add');
    Route::delete('settings/workspaces/{workspace}/members', [WorkspaceController::class, 'removeMember'])
        ->name('workspaces.settings.members.remove');
    Route::patch('settings/workspaces/{workspace}/members/role', [WorkspaceController::class, 'updateMemberRole'])
        ->name('workspaces.settings.members.role');

    Route::post('settings/workspaces/{workspace}/calendars', [CalendarController::class, 'store'])
        ->name('workspaces.settings.calendars.store');
    Route::post('settings/workspaces/{workspace}/calendars/connections/{connectionId}/sync', [CalendarController::class, 'syncConnection'])
        ->name('workspaces.settings.calendars.connections.sync');
    Route::patch('settings/workspaces/{workspace}/calendars/connections/{connectionId}/password', [CalendarController::class, 'updateConnectionPassword'])
        ->name('workspaces.settings.calendars.connections.password');
    Route::delete('settings/workspaces/{workspace}/calendars/connections/{connectionId}', [CalendarController::class, 'destroyConnection'])
        ->name('workspaces.settings.calendars.connections.destroy');
    Route::delete('settings/workspaces/{workspace}/calendars/{calendar}', [CalendarController::class, 'destroy'])
        ->name('workspaces.settings.calendars.destroy');
    Route::post('settings/workspaces/{workspace}/calendars/{calendar}/sync', [CalendarController::class, 'sync'])
        ->name('workspaces.settings.calendars.sync');
    Route::patch('settings/workspaces/{workspace}/calendars/{calendar}', [CalendarController::class, 'update'])
        ->name('workspaces.settings.calendars.update');
});
