<?php

namespace App\Console\Commands;

use App\Domain\LegacyImport\ClearWorkspaceContent;
use App\Models\Workspace;
use Illuminate\Console\Command;

class ClearWorkspaceNotes extends Command
{
    protected $signature = 'notes:clear-workspace
        {--workspace= : Workspace UUID}
        {--dry-run : Show what would be removed without writing}
        {--force : Run without interactive confirmation}';

    protected $description = 'Clear all notes and legacy import rows for a workspace.';

    public function handle(ClearWorkspaceContent $clearer): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');
        $workspaceOption = trim((string) $this->option('workspace'));

        $workspace = $workspaceOption !== ''
            ? Workspace::query()->where('id', $workspaceOption)->first()
            : Workspace::query()->orderBy('created_at')->first();

        if (! $workspace) {
            $this->error('Workspace not found.');

            return self::FAILURE;
        }

        if (! $dryRun && ! $force) {
            $confirmed = $this->confirm(
                "This will permanently clear all notes and legacy import rows in workspace '{$workspace->name}'. Continue?",
                false,
            );

            if (! $confirmed) {
                $this->warn('Workspace clear cancelled.');

                return self::SUCCESS;
            }
        }

        $modeLabel = $dryRun
            ? '<fg=yellow;options=bold>DRY RUN</>'
            : '<fg=green;options=bold>LIVE RUN</>';

        $ownerEmail = (string) ($workspace->owner()->value('email') ?? 'unknown');

        $this->line('');
        $this->line('<options=bold;fg=cyan>WORKSPACE CLEAR CONTEXT</>');
        $this->line(str_repeat('=', 72));
        $this->line(" Workspace      : <options=bold>{$workspace->name}</>");
        $this->line(" Owner email    : <options=bold>{$ownerEmail}</>");
        $this->line(" Workspace ID   : <options=bold>{$workspace->id}</>");
        $this->line(" Run mode       : {$modeLabel}");
        $this->line(str_repeat('=', 72));

        $summary = $clearer->clear($workspace, $dryRun);

        $this->line('');
        $this->line('<options=bold;fg=cyan>Clear summary</>');
        $this->line(str_repeat('-', 72));
        $this->line(" Notes          : <fg=cyan>{$summary['notes']}</>");
        $this->line(" Note tasks     : <fg=cyan>{$summary['note_tasks']}</>");
        $this->line(" Note headings  : <fg=cyan>{$summary['note_headings']}</>");
        $this->line(" Note revisions : <fg=cyan>{$summary['note_revisions']}</>");
        $this->line(" Legacy notes   : <fg=cyan>{$summary['legacy_notes']}</>");
        $this->line(str_repeat('-', 72));
        $this->line($dryRun
            ? '<fg=yellow>Dry run complete. No rows were deleted.</>'
            : '<fg=green>Workspace clear complete.</>');

        return self::SUCCESS;
    }
}
