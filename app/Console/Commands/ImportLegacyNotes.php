<?php

namespace App\Console\Commands;

use App\Domain\LegacyImport\LegacyNotesImporter;
use App\Models\Workspace;
use Illuminate\Console\Command;

class ImportLegacyNotes extends Command
{
    protected $signature = 'notes:import-legacy
        {--notes=storage/old-notes.json : Path to old notes JSON export}
        {--blocks=storage/old-note_blocks.json : Path to old note blocks JSON export}
        {--workspace= : Workspace UUID}
        {--skip-wiki : Skip wiki-link conversion}
        {--dry-run : Parse input and print stats without writing}';

    protected $description = 'Import legacy notes + blocks export into current notes and legacy_notes storage.';

    public function handle(LegacyNotesImporter $importer): int
    {
        $workspaceOption = trim((string) $this->option('workspace'));

        $workspace = $workspaceOption !== ''
            ? Workspace::query()->where('id', $workspaceOption)->first()
            : Workspace::query()->orderBy('created_at')->first();

        if (! $workspace) {
            $this->error('Workspace not found.');

            return self::FAILURE;
        }

        $notesPath = $this->resolvePath((string) $this->option('notes'));
        $blocksPath = $this->resolvePath((string) $this->option('blocks'));

        try {
            $result = $importer->import(
                workspace: $workspace,
                notesPath: $notesPath,
                blocksPath: $blocksPath,
                skipWiki: (bool) $this->option('skip-wiki'),
                dryRun: (bool) $this->option('dry-run'),
            );
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info('Legacy import finished.');
        $this->line("Imported normal notes: {$result['imported_notes']}");
        $this->line("Imported journal notes: {$result['imported_journals']}");
        $this->line("Imported legacy rows: {$result['imported_legacy_rows']}");
        $this->line("Created synthetic folder notes: {$result['created_synthetic_notes']}");
        $this->line('Unresolved wiki-links: '.count($result['unresolved_wikilinks']));

        return self::SUCCESS;
    }

    private function resolvePath(string $path): string
    {
        $trimmed = trim($path);
        if ($trimmed === '') {
            return '';
        }

        if (str_starts_with($trimmed, '/')) {
            return $trimmed;
        }

        return base_path($trimmed);
    }
}
