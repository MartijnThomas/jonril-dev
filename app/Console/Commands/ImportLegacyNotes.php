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
        {--clear-workspace : Clear workspace content before importing}
        {--skip-wiki : Skip wiki-link conversion}
        {--dry-run : Parse input and print stats without writing}
        {--force : Run without interactive confirmation}
        {--with-details : Show imported notes detail table}';

    protected $description = 'Import legacy notes + blocks export into current notes and legacy_notes storage.';

    public function handle(LegacyNotesImporter $importer): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $force = (bool) $this->option('force');

        if (! $dryRun && ! $force) {
            $confirmed = $this->confirm(
                'This will write imported notes to the database. Continue?',
                false,
            );

            if (! $confirmed) {
                $this->warn('Import cancelled.');

                return self::SUCCESS;
            }
        }

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
        $ownerEmail = (string) ($workspace->owner()->value('email') ?? 'unknown');
        $modeLabel = $dryRun
            ? '<fg=yellow;options=bold>DRY RUN</>'
            : '<fg=green;options=bold>LIVE RUN</>';
        $clearWorkspace = (bool) $this->option('clear-workspace');

        $this->line('');
        $this->line('<options=bold;fg=cyan>LEGACY IMPORT CONTEXT</>');
        $this->line(str_repeat('=', 72));
        $this->line(" Workspace      : <options=bold>{$workspace->name}</>");
        $this->line(" Owner email    : <options=bold>{$ownerEmail}</>");
        $this->line(" Workspace ID   : <options=bold>{$workspace->id}</>");
        $this->line(" Run mode       : {$modeLabel}");
        $this->line(' Clear workspace: '.($clearWorkspace ? '<fg=yellow;options=bold>YES</>' : '<fg=cyan>NO</>'));
        $this->line(" Notes source   : {$notesPath}");
        $this->line(" Blocks source  : {$blocksPath}");
        $this->line(str_repeat('=', 72));

        if ($clearWorkspace) {
            $this->line('');
            $this->line('<options=bold;fg=blue>PRE-STEP: Clear Workspace</>');

            $clearExitCode = $this->call('notes:clear-workspace', [
                '--workspace' => $workspace->id,
                '--dry-run' => $dryRun,
                '--force' => ! $dryRun,
            ]);

            if ($clearExitCode !== self::SUCCESS) {
                $this->error('Workspace clear failed. Import aborted.');

                return self::FAILURE;
            }
        }

        try {
            $result = $importer->import(
                workspace: $workspace,
                notesPath: $notesPath,
                blocksPath: $blocksPath,
                skipWiki: (bool) $this->option('skip-wiki'),
                dryRun: $dryRun,
                progress: function (string $phase, array $metrics): void {
                    if ($phase === 'markdown') {
                        $this->line('');
                        $this->line('<options=bold;fg=blue>ACTION 1: Markdown Parse</>');
                        $this->line(" Tasks    : <fg=cyan>{$metrics['tasks_total']}</> (<fg=yellow>{$metrics['tasks_open']}</> open / <fg=green>{$metrics['tasks_closed']}</> closed)");
                        $this->line(" Links    : <fg=cyan>{$metrics['wikilinks']}</> wiki-links");
                        $this->line(" Mentions : <fg=cyan>{$metrics['mentions']}</>");
                        $this->line(" Hashtags : <fg=cyan>{$metrics['hashtags']}</>");

                        return;
                    }

                    if ($phase === 'enrichment') {
                        $this->line('');
                        $this->line('<options=bold;fg=blue>ACTION 2: Block Enrichment</>');
                        $this->line(" Task blocks available : <fg=cyan>{$metrics['task_blocks_available']}</>");
                        $this->line(" Task legacy IDs linked: <fg=cyan>{$metrics['task_ids_assigned']}</>");
                        $this->line(" Task legacy IDs miss. : <fg=yellow>{$metrics['task_ids_missing']}</>");
                    }
                },
            );
        } catch (\Throwable $exception) {
            $this->error($exception->getMessage());

            return self::FAILURE;
        }

        $this->info('Legacy import finished.');
        $this->line('');
        $this->line('<options=bold;fg=cyan>Import summary</>');
        $this->line(str_repeat('-', 72));
        $this->line(" Run mode       : {$modeLabel}");
        $this->line(str_repeat('-', 72));
        $this->line(" Imported notes : <fg=cyan>{$result['imported_notes']}</> normal, <fg=cyan>{$result['imported_journals']}</> journal");
        $this->line(" Legacy rows    : <fg=cyan>{$result['imported_legacy_rows']}</>");
        $this->line(" Synthetic notes: <fg=cyan>{$result['created_synthetic_notes']}</>");
        $this->line(
            " Tasks          : <fg=cyan>{$result['tasks_total']}</> total (<fg=yellow>{$result['tasks_open']}</> open / <fg=green>{$result['tasks_closed']}</> closed)",
        );
        $this->line('');
        $this->line(
            " Legacy IDs     : <fg=cyan>{$result['task_id_check']['task_ids_assigned']}</> linked / <fg=cyan>{$result['task_id_check']['tasks_total']}</> tasks (<fg=yellow>{$result['task_id_check']['task_ids_missing']}</> missing)",
        );
        $this->line(' Wiki unresolved: <fg=cyan>'.count($result['unresolved_wikilinks']).'</>');
        $this->line('');

        if (($result['task_id_check']['task_ids_missing'] ?? 0) > 0) {
            $this->warn('Legacy ID check: some parsed tasks are missing legacy_id links.');
            $rowsBySlug = collect($result['task_id_check']['missing_tasks'] ?? [])
                ->take(25)
                ->groupBy(fn (array $item): string => (string) ($item['slug'] ?? 'unknown'))
                ->sortKeysUsing(fn (string $a, string $b): int => strcasecmp($a, $b));

            $rows = [];
            foreach ($rowsBySlug as $slug => $groupedRows) {
                $rows[] = [
                    'raw markdown task' => "<fg=blue;options=bold>{$slug}</>",
                    'priority' => '',
                    'mentions' => '',
                    'hashtags' => '',
                    'wiki-links' => '',
                    'due' => '',
                    'deadline' => '',
                ];
                foreach ($groupedRows as $item) {
                    $rows[] = [
                        'raw markdown task' => (string) ($item['raw_markdown'] ?? ''),
                        'priority' => (string) (($item['priority'] ?? '') !== '' ? $item['priority'] : '-'),
                        'mentions' => (string) ($item['mentions'] ?? ''),
                        'hashtags' => (string) ($item['hashtags'] ?? ''),
                        'wiki-links' => (string) ($item['wikilinks'] ?? ''),
                        'due' => (string) (($item['due_date'] ?? '') !== '' ? $item['due_date'] : '-'),
                        'deadline' => (string) (($item['deadline_date'] ?? '') !== '' ? $item['deadline_date'] : '-'),
                    ];
                }
            }

            $this->table(['raw markdown task', 'priority', 'mentions', 'hashtags', 'wiki-links', 'due', 'deadline'], $rows);
        }

        if (! empty($result['unresolved_wikilink_details'])) {
            $this->line('');
            $this->line('<options=bold;fg=yellow>Unresolved Wiki-links</>');
            $rowsBySlug = collect($result['unresolved_wikilink_details'])
                ->groupBy(fn (array $item): string => (string) ($item['slug'] ?? 'unknown'))
                ->sortKeysUsing(fn (string $a, string $b): int => strcasecmp($a, $b));

            $rows = [];
            foreach ($rowsBySlug as $slug => $groupedRows) {
                $rows[] = [
                    'wikilink' => "<fg=blue;options=bold>{$slug}</>",
                    'block' => '',
                    'raw markdown block' => '',
                ];
                foreach ($groupedRows as $item) {
                    $rows[] = [
                        'wikilink' => (string) ($item['wikilink'] ?? ''),
                        'block' => (string) ($item['block_path'] ?? ''),
                        'raw markdown block' => (string) ($item['raw_markdown'] ?? ''),
                    ];
                }
            }

            $this->table(['wikilink', 'block', 'raw markdown block'], $rows);
        }

        if ((bool) $this->option('with-details')) {
            $rows = [];
            foreach ($result['normal_note_summaries'] as $summary) {
                $rows[] = [
                    'slug' => $summary['slug'],
                    'type' => 'note',
                    'tasks' => "{$summary['tasks_total']} ({$summary['tasks_open']}/{$summary['tasks_closed']})",
                    'wiki-links' => (string) $summary['wikilinks'],
                    'mentions' => (string) $summary['mentions'],
                    'hashtags' => (string) $summary['hashtags'],
                ];
            }
            foreach ($result['journal_note_summaries'] as $summary) {
                $rows[] = [
                    'slug' => $summary['slug'],
                    'type' => 'journal',
                    'tasks' => "{$summary['tasks_total']} ({$summary['tasks_open']}/{$summary['tasks_closed']})",
                    'wiki-links' => (string) $summary['wikilinks'],
                    'mentions' => (string) $summary['mentions'],
                    'hashtags' => (string) $summary['hashtags'],
                ];
            }

            usort($rows, function (array $a, array $b): int {
                return strcasecmp((string) $a['slug'], (string) $b['slug']);
            });

            $this->line('');
            $this->line('<options=bold>Imported notes detail</>');
            $this->table(
                ['slug', 'type', 'tasks', 'wiki-links', 'mentions', 'hashtags'],
                $rows,
            );
        }

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
