<?php

use App\Http\Controllers\NotesController;
use App\Http\Controllers\TasksController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;
use Laravel\Fortify\Features;

Route::inertia('/', 'welcome', [
    'canRegister' => Features::enabled(Features::registration()),
])->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard', [
            'content' => '<h1>Hallo wereld</h1>',
        ]);
    })->name('dashboard');

    Route::get('notes/', [NotesController::class, 'start'])
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
});

require __DIR__.'/settings.php';
