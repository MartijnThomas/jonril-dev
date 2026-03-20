<?php

namespace App\Support\Workspaces;

use App\Models\User;
use App\Models\Workspace;

class PersonalWorkspaceResolver
{
    public function resolveFor(User $user): ?Workspace
    {
        $personalWorkspace = $user->workspaces()
            ->where('workspaces.is_personal', true)
            ->orderByRaw("case when workspace_user.role = 'owner' then 0 else 1 end")
            ->orderBy('workspaces.created_at')
            ->first();

        if ($personalWorkspace instanceof Workspace) {
            return $personalWorkspace;
        }

        return $user->currentWorkspace();
    }
}
