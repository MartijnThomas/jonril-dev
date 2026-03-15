<?php

namespace App\Console\Commands\Notes;

use App\Models\Workspace;
use Illuminate\Console\Command;

class UnmigrateWorkspace extends Command
{
    protected $signature = 'notes:unmigrate-workspace
        {--workspace= : Workspace UUID}
        {--force : Run without interactive confirmation}';

    protected $description = 'Remove the migrated_at timestamp from a workspace, making it editable again.';

    public function handle(): int
    {
        $workspaceId = (string) $this->option('workspace');
        $force = (bool) $this->option('force');

        if ($workspaceId === '') {
            $this->error('Please provide a workspace UUID via --workspace=<uuid>.');

            return self::FAILURE;
        }

        /** @var Workspace|null $workspace */
        $workspace = Workspace::query()->find($workspaceId);

        if (! $workspace) {
            $this->error("Workspace '{$workspaceId}' not found.");

            return self::FAILURE;
        }

        if ($workspace->migrated_at === null) {
            $this->warn("Workspace '{$workspace->name}' ({$workspace->id}) is not marked as migrated. Nothing to do.");

            return self::SUCCESS;
        }

        $ownerEmail = (string) ($workspace->owner()->value('email') ?? 'unknown');

        $this->line('');
        $this->line('<options=bold;fg=cyan>UNMIGRATE WORKSPACE CONTEXT</>');
        $this->line(str_repeat('=', 60));
        $this->line(" Workspace   : <options=bold>{$workspace->name}</>");
        $this->line(" ID          : <options=bold>{$workspace->id}</>");
        $this->line(" Owner       : <fg=cyan>{$ownerEmail}</>");
        $this->line(" Migrated at : <fg=yellow>{$workspace->migrated_at}</>");
        $this->line(str_repeat('=', 60));
        $this->line('');

        if (! $force) {
            $confirmed = $this->confirm(
                "This will remove the migrated_at timestamp from workspace '{$workspace->name}', making it editable again. Continue?",
                false,
            );

            if (! $confirmed) {
                $this->warn('Unmigrate cancelled.');

                return self::SUCCESS;
            }
        }

        $workspace->migrated_at = null;
        $workspace->save();

        $this->line('');
        $this->line("<fg=green>Workspace '{$workspace->name}' is no longer marked as migrated.</>");

        return self::SUCCESS;
    }
}
