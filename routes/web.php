<?php

use App\Http\Controllers\CommandSearchController;
use App\Http\Controllers\NotesController;
use App\Http\Controllers\TasksController;
use App\Http\Controllers\WorkspaceController;
use App\Http\Controllers\WorkspaceSuggestionController;
use App\Http\Controllers\WorkspaceSwitchController;
use Illuminate\Support\Facades\Route;
use Laravel\Fortify\Features;

Route::inertia('/', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('journal', function () {
        return redirect()->route('journal.show', [
            'granularity' => 'daily',
            'period' => now()->toDateString(),
        ]);
    })->name('journal.landing');

    Route::get('notes', function () {
        return redirect()->route('journal.show', [
            'granularity' => 'daily',
            'period' => now()->toDateString(),
        ]);
    })->name('notes.landing');

    Route::get('notes/list', [NotesController::class, 'index'])
        ->name('notes.index');
    Route::get('notes/tree', [NotesController::class, 'tree'])
        ->name('notes.tree');

    Route::get('notes/create', [NotesController::class, 'start'])
        ->name('notes.start');

    Route::get('journal/{granularity}/{period}', [NotesController::class, 'showJournal'])
        ->name('journal.show');

    Route::get('notes/{note}', [NotesController::class, 'show'])
        ->where('note', '.*')
        ->name('notes.show');

    Route::put('notes/{note}', [NotesController::class, 'update'])
        ->where('note', '.*')
        ->name('notes.update');

    Route::get('tasks', [TasksController::class, 'index'])
        ->name('tasks.index');
    Route::get('search/command', CommandSearchController::class)
        ->name('search.command');
    Route::patch('tasks/checked', [TasksController::class, 'updateCheckedByReference'])
        ->name('tasks.checked-by-reference');
    Route::patch('tasks/{task}/checked', [TasksController::class, 'updateChecked'])
        ->name('tasks.checked');

    Route::post('workspaces/switch', WorkspaceSwitchController::class)
        ->name('workspaces.switch');
    Route::post('workspaces', [WorkspaceController::class, 'store'])
        ->name('workspaces.store');
    Route::post('workspaces/suggestions', WorkspaceSuggestionController::class)
        ->name('workspaces.suggestions.store');
    Route::get('workspaces/settings', [WorkspaceController::class, 'edit'])
        ->name('workspaces.settings.edit');
    Route::get('workspaces/settings/data', [WorkspaceController::class, 'data'])
        ->name('workspaces.settings.data');
    Route::patch('workspaces/settings', [WorkspaceController::class, 'update'])
        ->name('workspaces.settings.update');
    Route::post('workspaces/settings/members', [WorkspaceController::class, 'addMember'])
        ->name('workspaces.settings.members.add');
    Route::delete('workspaces/settings/members', [WorkspaceController::class, 'removeMember'])
        ->name('workspaces.settings.members.remove');
    Route::patch('workspaces/settings/members/role', [WorkspaceController::class, 'updateMemberRole'])
        ->name('workspaces.settings.members.role');
});

require __DIR__.'/settings.php';
