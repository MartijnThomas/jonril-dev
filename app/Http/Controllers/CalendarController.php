<?php

namespace App\Http\Controllers;

use App\Jobs\SyncCalendarJob;
use App\Models\Calendar;
use App\Models\CalendarConnection;
use App\Models\User;
use App\Models\Workspace;
use App\Services\CalDavService;
use App\Support\Calendars\CalendarConnectionResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    public function __construct(
        private readonly CalDavService $calDavService,
        private readonly CalendarConnectionResolver $connectionResolver,
    ) {}

    public function store(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertPersonalWorkspace($workspace);

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

        $connection = CalendarConnection::query()->create([
            'workspace_id' => $workspace->id,
            'provider' => 'caldav',
            'server_url' => $this->connectionResolver->normalizeBaseUrl($data['url']),
            'username' => $data['username'],
            'password' => $data['password'],
            'last_discovered_at' => now(),
        ]);

        foreach ($discovered as $calendarInfo) {
            $calendar = $workspace->calendars()->create([
                'calendar_connection_id' => $connection->id,
                'name' => $calendarInfo['name'],
                'url' => $calendarInfo['url'],
                'color' => $calendarInfo['color'],
                'is_active' => false,
            ]);

            SyncCalendarJob::dispatch($calendar);
        }

        return back()->with('status', 'calendar-connected');
    }

    public function destroy(Request $request, Workspace $workspace, Calendar $calendar): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertPersonalWorkspace($workspace);
        abort_unless($calendar->workspace_id === $workspace->id, 404);

        $this->clearOutboundTimeblockTargetForWorkspaceUsers($workspace, [$calendar->id]);
        $calendar->delete();

        return back()->with('status', 'calendar-disconnected');
    }

    public function update(Request $request, Workspace $workspace, Calendar $calendar): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertPersonalWorkspace($workspace);
        abort_unless($calendar->workspace_id === $workspace->id, 404);

        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        $calendar->update($data);

        if (! $calendar->is_active) {
            $this->clearOutboundTimeblockTargetForWorkspaceUsers($workspace, [$calendar->id]);
        }

        return back()->with('status', 'calendar-updated');
    }

    public function syncConnection(Request $request, Workspace $workspace, string $connectionId): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertPersonalWorkspace($workspace);

        $calendars = $this->calendarsInConnection($workspace, $connectionId);
        abort_if($calendars->isEmpty(), 404);

        $primary = $calendars->first();
        $connection = $primary->connection;
        $discovered = $this->discoverCalendarsForConnection($primary);

        if ($discovered !== []) {
            $existingByUrl = $calendars->keyBy(fn (Calendar $calendar): string => (string) $calendar->url);
            $discoveredUrls = collect($discovered)
                ->pluck('url')
                ->filter(fn ($url) => is_string($url) && trim($url) !== '')
                ->map(fn ($url) => trim((string) $url))
                ->values()
                ->all();

            foreach ($discovered as $calendarInfo) {
                $url = trim((string) ($calendarInfo['url'] ?? ''));
                if ($url === '') {
                    continue;
                }

                $existing = $existingByUrl->get($url);
                if ($existing) {
                    $existing->update([
                        'name' => (string) ($calendarInfo['name'] ?? $existing->name),
                        'color' => $calendarInfo['color'] ?? $existing->color,
                        'calendar_connection_id' => $connection?->id ?? $existing->calendar_connection_id,
                    ]);

                    continue;
                }

                Calendar::query()->create([
                    'workspace_id' => $workspace->id,
                    'calendar_connection_id' => $connection?->id,
                    'name' => (string) ($calendarInfo['name'] ?? 'Calendar'),
                    'url' => $url,
                    'color' => $calendarInfo['color'] ?? null,
                    'is_active' => false,
                ]);
            }

            Calendar::query()
                ->where('workspace_id', $workspace->id)
                ->whereIn('id', $calendars->pluck('id')->all())
                ->whereNotIn('url', $discoveredUrls)
                ->delete();

            $calendars = $this->calendarsInConnection($workspace, $connectionId);
        }

        if ($connection) {
            $connection->forceFill([
                'server_url' => $this->connectionResolver->normalizeBaseUrl((string) $primary->url),
                'last_discovered_at' => now(),
            ])->save();
        }

        return back()->with('status', 'calendar-connection-synced');
    }

    public function updateConnectionPassword(Request $request, Workspace $workspace, string $connectionId): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertPersonalWorkspace($workspace);

        $calendars = $this->calendarsInConnection($workspace, $connectionId);
        abort_if($calendars->isEmpty(), 404);

        $data = $request->validate([
            'password' => ['required', 'string', 'max:1024'],
        ]);

        $primary = $calendars->first();
        $connection = $primary?->connection;
        if ($connection) {
            $connection->forceFill([
                'password' => $data['password'],
            ])->save();
        }

        $calendars->each(function (Calendar $calendar): void {
            $calendar->forceFill([
                'sync_token' => null,
            ])->save();
        });

        return back()->with('status', 'calendar-connection-password-updated');
    }

    public function destroyConnection(Request $request, Workspace $workspace, string $connectionId): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertPersonalWorkspace($workspace);

        $calendars = $this->calendarsInConnection($workspace, $connectionId);
        abort_if($calendars->isEmpty(), 404);

        $this->clearOutboundTimeblockTargetForWorkspaceUsers(
            $workspace,
            $calendars->pluck('id')->map(fn ($id) => (string) $id)->all(),
        );

        $calendarIds = $calendars->pluck('id')->all();

        Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('id', $calendarIds)
            ->delete();

        CalendarConnection::query()
            ->where('workspace_id', $workspace->id)
            ->where('id', $connectionId)
            ->delete();

        return back()->with('status', 'calendar-connection-disconnected');
    }

    public function sync(Request $request, Workspace $workspace, Calendar $calendar): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertPersonalWorkspace($workspace);
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
        $this->assertPersonalWorkspace($workspace);

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

    private function assertPersonalWorkspace(Workspace $workspace): void
    {
        abort_unless($workspace->isPersonal(), 409, 'Calendars are only available in the personal workspace.');
    }

    /**
     * @param  array<int, string>  $calendarIds
     */
    private function clearOutboundTimeblockTargetForWorkspaceUsers(Workspace $workspace, array $calendarIds): void
    {
        $workspace->users()->each(function (User $user) use ($calendarIds): void {
            $selectedCalendarId = data_get($user->settings, 'calendar.outbound_timeblock_calendar_id');
            if (! is_string($selectedCalendarId) || ! in_array(trim($selectedCalendarId), $calendarIds, true)) {
                return;
            }

            $settings = is_array($user->settings) ? $user->settings : [];
            data_set($settings, 'calendar.outbound_timeblock_calendar_id', null);

            $user->forceFill([
                'settings' => $settings,
            ])->save();
        });
    }

    /**
     * @return \Illuminate\Support\Collection<int, Calendar>
     */
    private function calendarsInConnection(Workspace $workspace, string $connectionId): \Illuminate\Support\Collection
    {
        return Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('calendar_connection_id', $connectionId)
            ->get()
            ->values();
    }

    /**
     * @return array<int, array{name: string, url: string, color: string|null}>
     */
    private function discoverCalendarsForConnection(Calendar $primary): array
    {
        $connection = $primary->connection()->first();
        abort_unless($connection !== null, 409, 'Calendar connection missing.');
        $username = (string) $connection->username;
        $password = (string) $connection->password;
        $candidates = [];

        $primaryUrl = trim((string) $primary->url);
        if ($primaryUrl !== '') {
            $candidates[] = $primaryUrl;
        }

        $normalizedBase = $this->connectionResolver->normalizeBaseUrl($primaryUrl);
        if ($normalizedBase !== '' && ! in_array($normalizedBase, $candidates, true)) {
            $candidates[] = $normalizedBase;
        }

        $parts = parse_url($primaryUrl);

        if (is_array($parts) && isset($parts['scheme'], $parts['host'])) {
            $origin = strtolower((string) $parts['scheme']).'://'.strtolower((string) $parts['host']);
            if (isset($parts['port'])) {
                $origin .= ':'.$parts['port'];
            }

            $wellKnown = rtrim($origin, '/').'/.well-known/caldav';
            if (! in_array($wellKnown, $candidates, true)) {
                $candidates[] = $wellKnown;
            }

            $path = (string) ($parts['path'] ?? '/');
            $segments = array_values(array_filter(explode('/', trim($path, '/')), static fn (string $segment): bool => $segment !== ''));
            while (! empty($segments)) {
                array_pop($segments);
                $candidatePath = empty($segments) ? '/' : '/'.implode('/', $segments).'/';
                $candidateUrl = $origin.$candidatePath;

                if (! in_array($candidateUrl, $candidates, true)) {
                    $candidates[] = $candidateUrl;
                }
            }

            $origin .= '/';

            if (! in_array($origin, $candidates, true)) {
                $candidates[] = $origin;
            }
        }

        $best = [];
        foreach ($candidates as $url) {
            $discovered = $this->calDavService->discoverCalendars(
                $url,
                $username,
                $password,
            );

            if (count($discovered) > count($best)) {
                $best = $discovered;
            }
        }

        return collect($best)
            ->filter(fn (array $calendar): bool => isset($calendar['name'], $calendar['url']))
            ->unique(fn (array $calendar): string => strtolower(trim((string) $calendar['url'])))
            ->values()
            ->all();
    }
}
