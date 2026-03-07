<?php

namespace App\Http\Controllers;

use App\Models\Workspace;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WorkspaceSwitchController extends Controller
{
    public function __invoke(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'workspace_id' => [
                'required',
                'uuid',
                Rule::exists('workspace_user', 'workspace_id')->where(
                    fn ($query) => $query->where('user_id', $user->id),
                ),
            ],
        ]);

        /** @var Workspace|null $workspace */
        $workspace = Workspace::query()->find($data['workspace_id']);
        if (! $workspace) {
            abort(404);
        }

        $settings = is_array($user->settings) ? $user->settings : [];
        $settings['workspace_id'] = $workspace->id;

        $user->forceFill([
            'settings' => $settings,
        ])->save();

        return redirect()->route('journal.landing');
    }
}
