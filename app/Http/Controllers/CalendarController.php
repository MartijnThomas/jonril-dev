<?php

namespace App\Http\Controllers;

use App\Jobs\SyncCalendarJob;
use App\Models\Calendar;
use App\Models\Workspace;
use App\Services\CalDavService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    public function __construct(private readonly CalDavService $calDavService) {}

    public function store(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'url' => ['required', 'url', 'max:2048'],
            'username' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:1024'],
        ]);

        if (! $this->calDavService->testConnection($data['url'], $data['username'], $data['password'])) {
            return back()->withErrors([
                'calendar' => 'Could not connect to the CalDAV server. Please check your URL and credentials.',
            ])->withInput();
        }

        $discovered = $this->calDavService->discoverCalendars($data['url'], $data['username'], $data['password']);

        if (empty($discovered)) {
            $discovered = [[
                'name' => $data['name'],
                'url' => $data['url'],
                'color' => null,
            ]];
        }

        foreach ($discovered as $calendarInfo) {
            $calendar = $workspace->calendars()->create([
                'name' => $calendarInfo['name'],
                'provider' => 'caldav',
                'url' => $calendarInfo['url'],
                'username' => $data['username'],
                'password' => $data['password'],
                'color' => $calendarInfo['color'],
            ]);

            SyncCalendarJob::dispatch($calendar);
        }

        return back()->with('status', 'calendar-connected');
    }

    public function destroy(Request $request, Workspace $workspace, Calendar $calendar): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        abort_unless($calendar->workspace_id === $workspace->id, 404);

        $calendar->delete();

        return back()->with('status', 'calendar-disconnected');
    }

    public function update(Request $request, Workspace $workspace, Calendar $calendar): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        abort_unless($calendar->workspace_id === $workspace->id, 404);

        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $calendar->update($data);

        return back()->with('status', 'calendar-updated');
    }

    public function sync(Request $request, Workspace $workspace, Calendar $calendar): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        abort_unless($calendar->workspace_id === $workspace->id, 404);

        SyncCalendarJob::dispatchSync($calendar);

        return back()->with('status', 'calendar-synced');
    }

    public function refreshAll(Request $request, Workspace $workspace): JsonResponse|RedirectResponse
    {
        abort_unless(
            $workspace->users()->where('users.id', $request->user()->id)->exists(),
            403,
        );

        Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->each(function (Calendar $calendar): void {
                SyncCalendarJob::dispatchSync($calendar);
            });

        if ($request->expectsJson()) {
            return response()->json(['ok' => true]);
        }

        return back();
    }

    private function assertOwner(Request $request, Workspace $workspace): void
    {
        $isOwner = $workspace->users()
            ->where('users.id', $request->user()->id)
            ->wherePivot('role', 'owner')
            ->exists();

        abort_unless($isOwner, 403);
    }
}
