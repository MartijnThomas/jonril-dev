<?php

use App\Http\Controllers\CommandSearchController;
use App\Http\Controllers\DocumentationController;
use App\Http\Controllers\NotesController;
use App\Http\Controllers\TasksController;
use App\Http\Controllers\WorkspaceController;
use App\Http\Controllers\WorkspaceSuggestionController;
use App\Http\Controllers\WorkspaceSwitchController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;
use Laravel\Sanctum\PersonalAccessToken;

Route::inertia('/', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('home');

if (app()->environment('local')) {
    Route::get('dev/auth/token-login', function (Request $request) {
        $data = $request->validate([
            'token' => ['required', 'string'],
            'redirect' => ['nullable', 'string'],
        ]);

        $accessToken = PersonalAccessToken::findToken($data['token']);

        abort_unless($accessToken !== null, 403);
        abort_unless($accessToken->can('dev-auth-login'), 403);
        abort_unless($accessToken->tokenable instanceof \App\Models\User, 403);

        Auth::login($accessToken->tokenable);
        $accessToken->delete();

        $redirect = trim((string) ($data['redirect'] ?? '/'));
        if ($redirect === '' || ! str_starts_with($redirect, '/')) {
            $redirect = '/';
        }

        return redirect($redirect);
    })->name('dev.auth.token-login');
}

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('journal', function (Request $request) {
        $workspace = $request->user()?->currentWorkspace();
        abort_if(! $workspace, 403, 'No workspace available.');

        if ($workspace->isMigratedSource()) {
            return redirect()->route('notes.index', [
                'type' => 'all',
            ]);
        }

        return redirect()->route('journal.show.by-period', [
            'workspace' => $workspace->slug,
            'period' => now()->toDateString(),
        ]);
    })->name('journal.landing');

    Route::get('notes', function (Request $request) {
        $workspace = $request->user()?->currentWorkspace();
        abort_if(! $workspace, 403, 'No workspace available.');

        if ($workspace->isMigratedSource()) {
            return redirect()->route('notes.index', [
                'type' => 'all',
            ]);
        }

        return redirect()->route('journal.show.by-period', [
            'workspace' => $workspace->slug,
            'period' => now()->toDateString(),
        ]);
    })->name('notes.landing');

    Route::get('notes/list', [NotesController::class, 'index'])
        ->name('notes.index');
    Route::get('notes/tree', [NotesController::class, 'tree'])
        ->name('notes.tree');

    Route::get('notes/create', [NotesController::class, 'start'])
        ->name('notes.start');
    Route::post('notes', [NotesController::class, 'store'])
        ->name('notes.store');

    Route::get('w/{workspace:slug}/journal/{granularity}/{period}', [NotesController::class, 'showJournalScoped'])
        ->name('journal.show');
    Route::get('w/{workspace:slug}/journal/{period}', [NotesController::class, 'showJournalScopedByPeriod'])
        ->where('period', '\d{4}(?:-W\d{2}|-\d{2}(?:-\d{2})?)')
        ->name('journal.show.by-period');

    Route::patch('notes/{noteId}/rename', [NotesController::class, 'rename'])
        ->whereUuid('noteId')
        ->name('notes.rename');
    Route::patch('notes/{noteId}/move', [NotesController::class, 'move'])
        ->whereUuid('noteId')
        ->name('notes.move');
    Route::patch('notes/{noteId}/clear', [NotesController::class, 'clear'])
        ->whereUuid('noteId')
        ->name('notes.clear');
    Route::delete('notes/{noteId}', [NotesController::class, 'destroy'])
        ->whereUuid('noteId')
        ->name('notes.destroy');

    Route::get('w/{workspace:slug}/notes/{note}', [NotesController::class, 'showScoped'])
        ->where('note', '.*')
        ->name('notes.show');

    Route::put('w/{workspace:slug}/notes/{note}', [NotesController::class, 'updateScoped'])
        ->where('note', '.*')
        ->name('notes.update');

    // Legacy non-workspace-scoped URLs (kept for backward compatibility).
    Route::get('journal/{granularity}/{period}', [NotesController::class, 'showJournal'])
        ->name('journal.show.legacy');
    Route::get('journal/{period}', [NotesController::class, 'showJournalByPeriod'])
        ->where('period', '\d{4}(?:-W\d{2}|-\d{2}(?:-\d{2})?)')
        ->name('journal.show.legacy.by-period');
    Route::get('notes/{note}', [NotesController::class, 'show'])
        ->where('note', '.*')
        ->name('notes.show.legacy');
    Route::put('notes/{note}', [NotesController::class, 'update'])
        ->where('note', '.*')
        ->name('notes.update.legacy');

    Route::get('tasks', [TasksController::class, 'index'])
        ->name('tasks.index');
    Route::get('docs', [DocumentationController::class, 'index'])
        ->name('docs.index');
    Route::get('docs/{slug}', [DocumentationController::class, 'show'])
        ->where('slug', '.*')
        ->name('docs.show');
    Route::get('search/command', CommandSearchController::class)
        ->name('search.command');
    Route::patch('tasks/checked', [TasksController::class, 'updateCheckedByReference'])
        ->name('tasks.checked-by-reference');
    Route::patch('tasks/{task}/checked', [TasksController::class, 'updateChecked'])
        ->name('tasks.checked');
    Route::post('tasks/filter-presets', [TasksController::class, 'saveFilterPreset'])
        ->name('tasks.filter-presets.store');
    Route::delete('tasks/filter-presets/{presetId}', [TasksController::class, 'deleteFilterPreset'])
        ->name('tasks.filter-presets.destroy');
    Route::get('tasks/migrate-targets', [TasksController::class, 'migrateTargets'])
        ->name('tasks.migrate-targets');
    Route::post('tasks/migrate', [TasksController::class, 'migrate'])
        ->name('tasks.migrate');

    Route::post('workspaces/switch', WorkspaceSwitchController::class)
        ->name('workspaces.switch');
    Route::post('workspaces', [WorkspaceController::class, 'store'])
        ->name('workspaces.store');
    Route::post('workspaces/suggestions', WorkspaceSuggestionController::class)
        ->name('workspaces.suggestions.store');
    Route::get('workspaces/settings', function (Request $request) {
        $workspace = $request->user()?->currentWorkspace();
        abort_if(! $workspace, 403, 'No workspace available.');

        return redirect()->route('workspaces.settings.edit', [
            'workspace' => $workspace->id,
        ]);
    })->name('workspaces.settings.legacy');
});

require __DIR__.'/settings.php';
