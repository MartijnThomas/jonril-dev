<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class WorkspaceController extends Controller
{
    public function store(Request $request): RedirectResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
        ]);

        $workspace = Workspace::query()->create([
            'owner_id' => $user->id,
            'name' => trim($data['name']),
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

    public function edit(Request $request): Response
    {
        $workspace = $this->currentWorkspace($request);
        $this->assertOwner($request, $workspace);

        $members = $workspace->users()
            ->select('users.id', 'users.name', 'users.email', 'workspace_user.role')
            ->orderByRaw("case when workspace_user.role = 'owner' then 0 else 1 end")
            ->orderBy('users.name')
            ->get()
            ->map(fn ($user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'role' => (string) ($user->pivot->role ?? 'member'),
            ])
            ->values();

        return Inertia::render('workspaces/settings', [
            'workspace' => [
                'id' => $workspace->id,
                'name' => $workspace->name,
                'owner_id' => $workspace->owner_id,
            ],
            'members' => $members,
            'status' => $request->session()->get('status'),
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $workspace = $this->currentWorkspace($request);
        $this->assertOwner($request, $workspace);

        $data = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:120'],
        ]);

        $workspace->name = trim($data['name']);
        $workspace->save();

        return back()->with('status', 'workspace-updated');
    }

    public function addMember(Request $request): RedirectResponse
    {
        $workspace = $this->currentWorkspace($request);
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

    public function removeMember(Request $request): RedirectResponse
    {
        $workspace = $this->currentWorkspace($request);
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

    public function updateMemberRole(Request $request): RedirectResponse
    {
        $workspace = $this->currentWorkspace($request);
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

    private function currentWorkspace(Request $request): Workspace
    {
        $workspace = $request->user()?->currentWorkspace();

        if (! $workspace) {
            abort(403, 'No workspace available.');
        }

        return $workspace;
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
