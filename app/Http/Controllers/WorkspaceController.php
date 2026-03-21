<?php

namespace App\Http\Controllers;

use App\Domain\LegacyImport\ClearWorkspaceContent;
use App\Models\Calendar;
use App\Models\Note;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Models\Workspace;
use App\Services\TimeblockCalendarSyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class WorkspaceController extends Controller
{
    private const WORKSPACE_COLORS = [
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
        'black',
    ];

    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'color' => ['nullable', Rule::in(self::WORKSPACE_COLORS)],
            'timeblock_color' => ['nullable', Rule::in(self::WORKSPACE_COLORS)],
            'editor_mode' => ['nullable', Rule::in(Workspace::EDITOR_MODES)],
            'icon' => ['nullable', 'regex:/^[a-z][a-z0-9_]*$/'],
        ]);

        $workspace = Workspace::query()->create([
            'owner_id' => $user->id,
            'is_personal' => false,
            'name' => trim($data['name']),
            'color' => array_key_exists('color', $data) ? $data['color'] : null,
            'timeblock_color' => array_key_exists('timeblock_color', $data) ? $data['timeblock_color'] : null,
            'editor_mode' => array_key_exists('editor_mode', $data) ? ($data['editor_mode'] ?: Workspace::EDITOR_MODE_LEGACY) : Workspace::EDITOR_MODE_LEGACY,
            'icon' => array_key_exists('icon', $data) ? $data['icon'] : null,
        ]);

        $workspace->users()->attach($user->id, [
            'role' => 'owner',
        ]);

        $settings = is_array($user->settings) ? $user->settings : [];
        $settings['workspace_id'] = $workspace->id;

        $user->forceFill([
            'settings' => $settings,
        ])->save();

        return redirect()->route('journal.landing');
    }

    public function edit(Request $request, Workspace $workspace): Response
    {
        $this->assertOwner($request, $workspace);

        $payload = $this->workspaceSettingsPayload($workspace, $request->user());

        return Inertia::render('workspaces/settings', [
            ...$payload,
            'status' => $request->session()->get('status'),
        ]);
    }

    public function data(Request $request, Workspace $workspace): JsonResponse
    {
        $this->assertOwner($request, $workspace);

        return response()->json($this->workspaceSettingsPayload($workspace, $request->user()));
    }

    public function update(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceMutable($workspace);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
            'color' => ['nullable', Rule::in(self::WORKSPACE_COLORS)],
            'timeblock_color' => ['nullable', Rule::in(self::WORKSPACE_COLORS)],
            'editor_mode' => ['nullable', Rule::in(Workspace::EDITOR_MODES)],
            'icon' => ['nullable', 'regex:/^[a-z][a-z0-9_]*$/'],
        ]);

        $workspace->name = trim($data['name']);
        if (array_key_exists('color', $data)) {
            $workspace->color = $data['color'] ?: null;
        }
        if (array_key_exists('timeblock_color', $data)) {
            $workspace->timeblock_color = $data['timeblock_color'] ?: null;
        }
        if (array_key_exists('editor_mode', $data)) {
            $workspace->editor_mode = $data['editor_mode'] ?: Workspace::EDITOR_MODE_LEGACY;
        }
        if (array_key_exists('icon', $data)) {
            $workspace->icon = $data['icon'] ?: null;
        }
        $workspace->save();

        return back()->with('status', 'workspace-updated');
    }

    public function migrateToBlock(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceMutable($workspace);

        if ($workspace->isMigratedSource()) {
            return back()->withErrors([
                'workspace' => 'This workspace has already been migrated.',
            ]);
        }

        if ($workspace->editor_mode !== Workspace::EDITOR_MODE_LEGACY) {
            return back()->withErrors([
                'workspace' => 'Only legacy workspaces can be migrated.',
            ]);
        }

        $exitCode = Artisan::call('notes:convert-workspace-to-block', [
            '--workspace' => $workspace->id,
            '--force' => true,
        ]);

        if ($exitCode !== 0) {
            return back()->withErrors([
                'workspace' => 'Workspace migration failed. Check logs for details.',
            ]);
        }

        return back()
            ->with('status', 'workspace-migrated')
            ->with('migration_summary', $this->workspaceMigrationSummary($workspace));
    }

    public function addMember(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceMutable($workspace);

        $data = $request->validate([
            'email' => [
                'required',
                'email',
                Rule::exists('users', 'email'),
            ],
        ]);

        $user = User::query()->where('email', $data['email'])->firstOrFail();

        if ($workspace->users()->where('users.id', $user->id)->exists()) {
            return back()->withErrors([
                'email' => 'This user is already a workspace member.',
            ]);
        }

        $workspace->users()->attach($user->id, [
            'role' => 'member',
        ]);

        return back()->with('status', 'member-added');
    }

    public function removeMember(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceMutable($workspace);

        $data = $request->validate([
            'user_id' => [
                'required',
                'integer',
                Rule::exists('workspace_user', 'user_id')->where(
                    fn ($query) => $query->where('workspace_id', $workspace->id),
                ),
            ],
        ]);

        if ((int) $data['user_id'] === (int) $workspace->owner_id) {
            return back()->withErrors([
                'user_id' => 'You cannot remove the workspace owner.',
            ]);
        }

        $workspace->users()->detach((int) $data['user_id']);

        return back()->with('status', 'member-removed');
    }

    public function updateMemberRole(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceMutable($workspace);

        $data = $request->validate([
            'user_id' => [
                'required',
                'integer',
                Rule::exists('workspace_user', 'user_id')->where(
                    fn ($query) => $query->where('workspace_id', $workspace->id),
                ),
            ],
            'role' => ['required', Rule::in(['owner', 'member'])],
        ]);

        $targetUserId = (int) $data['user_id'];
        $targetRole = (string) $data['role'];

        if ($targetRole === 'owner') {
            if ($workspace->isPersonal()) {
                return back()->withErrors([
                    'role' => 'Personal workspace ownership cannot be transferred.',
                ]);
            }

            DB::transaction(function () use ($workspace, $targetUserId): void {
                DB::table('workspace_user')
                    ->where('workspace_id', $workspace->id)
                    ->update(['role' => 'member', 'updated_at' => now()]);

                DB::table('workspace_user')
                    ->where('workspace_id', $workspace->id)
                    ->where('user_id', $targetUserId)
                    ->update(['role' => 'owner', 'updated_at' => now()]);

                $workspace->owner_id = $targetUserId;
                $workspace->save();
            });

            return back()->with('status', 'owner-transferred');
        }

        if ($targetUserId === (int) $workspace->owner_id) {
            return back()->withErrors([
                'role' => 'Transfer ownership first before changing owner role.',
            ]);
        }

        DB::table('workspace_user')
            ->where('workspace_id', $workspace->id)
            ->where('user_id', $targetUserId)
            ->update([
                'role' => 'member',
                'updated_at' => now(),
            ]);

        return back()->with('status', 'member-role-updated');
    }

    public function destroy(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceDeletable($workspace);

        $owner = $request->user();
        if (! $owner) {
            abort(403);
        }

        $remainingWorkspaceIds = $owner->workspaces()
            ->where('workspaces.id', '!=', $workspace->id)
            ->pluck('workspaces.id')
            ->values();

        if ($remainingWorkspaceIds->isEmpty()) {
            return back()->withErrors([
                'workspace' => 'You cannot delete your last workspace.',
            ]);
        }

        $workspace->delete();

        $settings = is_array($owner->settings) ? $owner->settings : [];
        $preferredWorkspaceId = (string) ($settings['workspace_id'] ?? '');
        if ($preferredWorkspaceId === $workspace->id) {
            $settings['workspace_id'] = $remainingWorkspaceIds->first();
            $owner->forceFill([
                'settings' => $settings,
            ])->save();
        }

        return redirect()->route('notes.index', [
            'type' => 'all',
        ])->with('status', 'workspace-deleted');
    }

    public function clear(Request $request, Workspace $workspace, ClearWorkspaceContent $clearer): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceClearable($workspace);

        $data = $request->validate([
            'include_calendars' => ['nullable', 'boolean'],
        ]);

        $clearer->clear($workspace, includeCalendars: (bool) ($data['include_calendars'] ?? false));

        return back()->with('status', 'workspace-cleared');
    }

    public function updateTimeblockSyncTarget(
        Request $request,
        Workspace $workspace,
        TimeblockCalendarSyncService $syncService,
    ): RedirectResponse {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceMutable($workspace);

        if (! $workspace->isPersonal()) {
            abort(409, 'Timeblock outbound sync target is only configurable in personal workspaces.');
        }

        $data = $request->validate([
            'calendar_id' => ['nullable', 'uuid'],
        ]);

        $calendarId = $data['calendar_id'] ?? null;
        if (is_string($calendarId)) {
            $calendarId = trim($calendarId);
            if ($calendarId === '') {
                $calendarId = null;
            }
        }

        $selectedCalendar = null;
        if ($calendarId !== null) {
            $selectedCalendar = Calendar::query()
                ->where('id', $calendarId)
                ->where('workspace_id', $workspace->id)
                ->where('is_active', true)
                ->first();

            if (! $selectedCalendar) {
                return back()->withErrors([
                    'calendar_id' => 'Please select an active calendar from this personal workspace.',
                ]);
            }
        }

        $user = $request->user();
        $settings = is_array($user->settings) ? $user->settings : [];
        data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendarId);

        $user->forceFill([
            'settings' => $settings,
        ])->save();

        $relinkedCount = 0;
        if ($selectedCalendar) {
            $relinkedCount = $syncService->relinkExistingForCalendar($selectedCalendar);
        }

        return back()
            ->with('status', 'timeblock-sync-target-updated')
            ->with('timeblock_sync_relinked_count', $relinkedCount);
    }

    public function retryFailedTimeblockSync(
        Request $request,
        Workspace $workspace,
        TimeblockCalendarSyncService $syncService,
    ): RedirectResponse {
        $this->assertOwner($request, $workspace);
        $this->assertWorkspaceMutable($workspace);

        if (! $workspace->isPersonal()) {
            abort(409, 'Timeblock outbound sync target is only configurable in personal workspaces.');
        }

        $selectedCalendarId = data_get($request->user()?->settings, 'calendar.outbound_timeblock_calendar_id');
        if (! is_string($selectedCalendarId) || trim($selectedCalendarId) === '') {
            return back()->withErrors([
                'timeblock_sync' => 'Select an outbound calendar first.',
            ]);
        }

        $calendar = Calendar::query()
            ->where('id', trim($selectedCalendarId))
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->first();

        if (! $calendar) {
            return back()->withErrors([
                'timeblock_sync' => 'Selected outbound calendar is not active anymore.',
            ]);
        }

        $retried = $syncService->retryFailedForCalendar($calendar);

        return back()
            ->with('status', 'timeblock-sync-retry-dispatched')
            ->with('timeblock_sync_retry_count', $retried);
    }

    public function reactivate(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);
        $this->assertAdmin($request);

        if (! $workspace->isMigratedSource()) {
            return back();
        }

        $workspace->forceFill([
            'migrated_at' => null,
        ])->save();

        return back()->with('status', 'workspace-reactivated');
    }

    private function assertOwner(Request $request, Workspace $workspace): void
    {
        $isOwner = $workspace->users()
            ->where('users.id', $request->user()->id)
            ->wherePivot('role', 'owner')
            ->exists();

        abort_unless($isOwner, 403);
    }

    private function assertWorkspaceMutable(Workspace $workspace): void
    {
        if (! $workspace->isMigratedSource()) {
            return;
        }

        abort(409, 'Migrated source workspaces are read-only.');
    }

    private function assertWorkspaceDeletable(Workspace $workspace): void
    {
        if (! $workspace->isPersonal()) {
            return;
        }

        abort(409, 'Personal workspace cannot be deleted.');
    }

    private function assertWorkspaceClearable(Workspace $workspace): void
    {
        if ($workspace->isPersonal()) {
            return;
        }

        abort(409, 'Only personal workspace can be cleared.');
    }

    private function assertAdmin(Request $request): void
    {
        abort_unless((string) ($request->user()?->role ?? '') === 'admin', 403);
    }

    /**
     * @return array{
     *     workspace: array{id: string, name: string, color: string, timeblock_color: string|null, editor_mode: string, icon: string, owner_id: int, is_personal: bool, is_migrated_source: bool, can_migrate_to_block: bool},
     *     members: array<int, array{id: int, name: string, email: string, role: string}>,
     *     timeblockSyncTargetCalendarId: string|null,
     *     timeblockSync: array{
     *         selected_calendar_id: string|null,
     *         stats: array{
     *             pending: int,
     *             failed: int,
     *             synced: int,
     *             total: int
     *         }
     *     },
     *     migrationSummary: array{
     *         workspace: array{id: string, name: string, slug: string},
     *         notes: array{total: int, normal: int, journal: int}
     *     }|null
     * }
     */
    private function workspaceSettingsPayload(Workspace $workspace, ?User $viewer = null): array
    {
        $members = $workspace->users()
            ->select('users.id', 'users.name', 'users.email', 'workspace_user.role')
            ->orderByRaw("case when workspace_user.role = 'owner' then 0 else 1 end")
            ->orderBy('users.name')
            ->get()
            ->map(fn ($user) => [
                'id' => (int) $user->id,
                'name' => (string) $user->name,
                'email' => (string) $user->email,
                'role' => (string) ($user->pivot->role ?? 'member'),
            ])
            ->values()
            ->all();

        $calendars = $workspace->calendars()
            ->with('connection')
            ->orderBy('name')
            ->get()
            ->map(fn ($calendar) => [
                'id' => $calendar->id,
                'connection_id' => $calendar->calendar_connection_id,
                'connection_key' => $calendar->calendar_connection_id,
                'name' => $calendar->name,
                'provider' => $calendar->connection?->provider ?? 'caldav',
                'url' => $calendar->url,
                'username' => $calendar->connection?->username ?? '',
                'color' => $calendar->color,
                'is_active' => $calendar->is_active,
                'last_synced_at' => $calendar->last_synced_at?->toIso8601String(),
            ])
            ->values()
            ->all();

        $selectedTimeblockSyncTargetCalendarId = data_get($viewer?->settings, 'calendar.outbound_timeblock_calendar_id');
        if (! is_string($selectedTimeblockSyncTargetCalendarId) || trim($selectedTimeblockSyncTargetCalendarId) === '') {
            $selectedTimeblockSyncTargetCalendarId = null;
        }

        $activeCalendarIds = array_values(array_filter(array_map(
            static fn (array $calendar): ?string => $calendar['is_active'] ? (string) $calendar['id'] : null,
            $calendars,
        )));

        if ($selectedTimeblockSyncTargetCalendarId !== null && ! in_array($selectedTimeblockSyncTargetCalendarId, $activeCalendarIds, true)) {
            $selectedTimeblockSyncTargetCalendarId = null;
        }

        $timeblockSyncStats = [
            'pending' => 0,
            'failed' => 0,
            'synced' => 0,
            'total' => 0,
        ];

        if ($workspace->isPersonal() && $selectedTimeblockSyncTargetCalendarId !== null) {
            $statsRows = TimeblockCalendarLink::query()
                ->selectRaw('sync_status, COUNT(*) as aggregate')
                ->where('calendar_id', $selectedTimeblockSyncTargetCalendarId)
                ->groupBy('sync_status')
                ->pluck('aggregate', 'sync_status');

            $pendingStatuses = [
                TimeblockCalendarLink::STATUS_PENDING_CREATE,
                TimeblockCalendarLink::STATUS_PENDING_UPDATE,
                TimeblockCalendarLink::STATUS_PENDING_DELETE,
            ];
            $pendingCount = 0;
            foreach ($pendingStatuses as $status) {
                $pendingCount += (int) ($statsRows[$status] ?? 0);
            }

            $failedCount = (int) ($statsRows[TimeblockCalendarLink::STATUS_FAILED] ?? 0);
            $syncedCount = (int) ($statsRows[TimeblockCalendarLink::STATUS_SYNCED] ?? 0);

            $timeblockSyncStats = [
                'pending' => $pendingCount,
                'failed' => $failedCount,
                'synced' => $syncedCount,
                'total' => $pendingCount + $failedCount + $syncedCount,
            ];
        }

        return [
            'workspace' => [
                'id' => $workspace->id,
                'name' => $workspace->name,
                'color' => $workspace->color,
                'timeblock_color' => $workspace->timeblock_color,
                'editor_mode' => $workspace->editor_mode,
                'icon' => $workspace->icon,
                'owner_id' => (int) $workspace->owner_id,
                'is_personal' => $workspace->isPersonal(),
                'is_migrated_source' => $workspace->isMigratedSource(),
                'can_migrate_to_block' => $workspace->editor_mode === Workspace::EDITOR_MODE_LEGACY && ! $workspace->isMigratedSource(),
            ],
            'members' => $members,
            'calendars' => $calendars,
            'timeblockSyncTargetCalendarId' => $workspace->isPersonal() ? $selectedTimeblockSyncTargetCalendarId : null,
            'timeblockSync' => [
                'selected_calendar_id' => $workspace->isPersonal() ? $selectedTimeblockSyncTargetCalendarId : null,
                'stats' => $timeblockSyncStats,
            ],
            'migrationSummary' => session('migration_summary', $this->workspaceMigrationSummary($workspace)),
        ];
    }

    /**
     * @return array{
     *     workspace: array{id: string, name: string, slug: string},
     *     notes: array{total: int, normal: int, journal: int}
     * }|null
     */
    private function workspaceMigrationSummary(Workspace $sourceWorkspace): ?array
    {
        $targetWorkspace = Workspace::query()
            ->where('owner_id', $sourceWorkspace->owner_id)
            ->where('editor_mode', Workspace::EDITOR_MODE_BLOCK)
            ->where('name', $sourceWorkspace->name.' (Block)')
            ->latest('created_at')
            ->first();

        if (! $targetWorkspace) {
            return null;
        }

        $baseQuery = Note::query()->where('workspace_id', $targetWorkspace->id);
        $total = (clone $baseQuery)->count();
        $journal = (clone $baseQuery)->where('type', Note::TYPE_JOURNAL)->count();
        $normal = $total - $journal;

        return [
            'workspace' => [
                'id' => $targetWorkspace->id,
                'name' => $targetWorkspace->name,
                'slug' => $targetWorkspace->slug,
            ],
            'notes' => [
                'total' => $total,
                'normal' => $normal,
                'journal' => $journal,
            ],
        ];
    }
}
