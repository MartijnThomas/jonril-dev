<?php

namespace App\Console\Commands\Workspaces;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class SetPersonalWorkspace extends Command
{
    protected $signature = 'workspaces:set-personal
        {--user= : User id or email}
        {--workspace= : Workspace id or slug}
        {--force : Run without interactive confirmation}';

    protected $description = 'Set the personal workspace for an existing user.';

    public function handle(): int
    {
        $userOption = trim((string) $this->option('user'));
        $workspaceOption = trim((string) $this->option('workspace'));
        $force = (bool) $this->option('force');

        if ($userOption === '') {
            $this->error('Please provide --user=<id|email>.');

            return self::FAILURE;
        }

        if ($workspaceOption === '') {
            $this->error('Please provide --workspace=<id|slug>.');

            return self::FAILURE;
        }

        $user = $this->resolveUser($userOption);
        if (! $user) {
            $this->error("User '{$userOption}' not found.");

            return self::FAILURE;
        }

        $workspace = $this->resolveWorkspace($workspaceOption);
        if (! $workspace) {
            $this->error("Workspace '{$workspaceOption}' not found.");

            return self::FAILURE;
        }

        if ((int) $workspace->owner_id !== (int) $user->id) {
            $this->error("Workspace '{$workspace->name}' is not owned by '{$user->email}'.");

            return self::FAILURE;
        }

        if (! $force) {
            $confirmed = $this->confirm(
                "Set personal workspace for {$user->email} to '{$workspace->name}' ({$workspace->id})?",
                false,
            );

            if (! $confirmed) {
                $this->warn('Set personal workspace cancelled.');

                return self::SUCCESS;
            }
        }

        DB::transaction(function () use ($user, $workspace): void {
            Workspace::query()
                ->where('owner_id', $user->id)
                ->update(['is_personal' => false, 'updated_at' => now()]);

            $workspace->forceFill([
                'is_personal' => true,
            ])->save();
        });

        $this->info("Personal workspace set to '{$workspace->name}' ({$workspace->id}) for {$user->email}.");

        return self::SUCCESS;
    }

    private function resolveUser(string $value): ?User
    {
        if (is_numeric($value)) {
            return User::query()->find((int) $value);
        }

        return User::query()->where('email', $value)->first();
    }

    private function resolveWorkspace(string $value): ?Workspace
    {
        return Workspace::query()
            ->where('id', $value)
            ->orWhere('slug', $value)
            ->first();
    }
}
