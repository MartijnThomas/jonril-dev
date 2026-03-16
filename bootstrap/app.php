<?php

use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withCommands([
        __DIR__.'/../app/Console/Commands',
    ])
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withSchedule(function (Schedule $schedule): void {
        $schedule
            ->command('notes:prune-revisions')
            ->cron((string) config('note-revisions.prune.cron', '0 * * * *'));

        $schedule
            ->command('calendars:sync')
            ->hourly()
            ->withoutOverlapping();
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->encryptCookies(except: ['appearance', 'sidebar_state']);
        $shouldSkipNoteContentSanitization = static function (Request $request): bool {
            if (! $request->isMethod('put')) {
                return false;
            }

            return $request->is('notes/*') || $request->is('w/*/notes/*');
        };

        $middleware->trimStrings([
            $shouldSkipNoteContentSanitization,
        ]);
        $middleware->convertEmptyStringsToNull([
            $shouldSkipNoteContentSanitization,
        ]);

        $middleware->web(append: [
            HandleAppearance::class,
            HandleInertiaRequests::class,
            AddLinkHeadersForPreloadedAssets::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        //
    })->create();
