<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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

        $payload = $this->workspaceSettingsPayload($workspace);

        return Inertia::render('workspaces/settings', [
            ...$payload,
            'status' => $request->session()->get('status'),
        ]);
    }

    public function data(Request $request, Workspace $workspace): JsonResponse
    {
        $this->assertOwner($request, $workspace);

        return response()->json($this->workspaceSettingsPayload($workspace));
    }

    public function update(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);

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

    public function addMember(Request $request, Workspace $workspace): RedirectResponse
    {
        $this->assertOwner($request, $workspace);

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

    private function assertOwner(Request $request, Workspace $workspace): void
    {
        $isOwner = $workspace->users()
            ->where('users.id', $request->user()->id)
            ->wherePivot('role', 'owner')
            ->exists();

        abort_unless($isOwner, 403);
    }

    /**
     * @return array{
     *     workspace: array{id: string, name: string, color: string, timeblock_color: string|null, editor_mode: string, icon: string, owner_id: int},
     *     members: array<int, array{id: int, name: string, email: string, role: string}>
     * }
     */
    private function workspaceSettingsPayload(Workspace $workspace): array
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

        return [
            'workspace' => [
                'id' => $workspace->id,
                'name' => $workspace->name,
                'color' => $workspace->color,
                'timeblock_color' => $workspace->timeblock_color,
                'editor_mode' => $workspace->editor_mode,
                'icon' => $workspace->icon,
                'owner_id' => (int) $workspace->owner_id,
            ],
            'members' => $members,
        ];
    }
}
