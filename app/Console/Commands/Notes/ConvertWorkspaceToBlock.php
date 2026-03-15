<?php

namespace App\Console\Commands\Notes;

use App\Models\Note;
use App\Models\Workspace;
use App\Support\Notes\LegacyToBlockNoteConverter;
use App\Support\Notes\NoteTitleExtractor;
use App\Support\Notes\NoteWordCountExtractor;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ConvertWorkspaceToBlock extends Command
{
    protected $signature = 'notes:convert-workspace-to-block
        {--workspace= : Workspace UUID}
        {--dry-run : Show conversion result without persisting}
        {--switch-mode : Deprecated (workspace copy is always created in block mode)}
        {--force : Run without interactive confirmation}';

    protected $description = 'Duplicate a legacy workspace, convert the copy to block format, and mark source workspace as migrated.';

    public function handle(
        LegacyToBlockNoteConverter $converter,
        NoteTitleExtractor $noteTitleExtractor,
        NoteWordCountExtractor $noteWordCountExtractor,
    ): int {
        $workspaceOption = trim((string) $this->option('workspace'));
        $dryRun = (bool) $this->option('dry-run');
        $switchMode = (bool) $this->option('switch-mode');
        $force = (bool) $this->option('force');

        $workspace = $workspaceOption !== ''
            ? Workspace::query()->where('id', $workspaceOption)->first()
            : Workspace::query()->orderBy('created_at')->first();

        if (! $workspace) {
            $this->error('Workspace not found.');

            return self::FAILURE;
        }

        if ($workspace->isMigratedSource()) {
            $this->warn("Workspace '{$workspace->name}' is already marked as migrated.");

            return self::SUCCESS;
        }

        if (! $dryRun && ! $force) {
            $confirmed = $this->confirm("This will duplicate workspace '{$workspace->name}', convert the copy to block format, and mark the source as migrated. Continue?", false);

            if (! $confirmed) {
                $this->warn('Workspace conversion cancelled.');

                return self::SUCCESS;
            }
        }

        $modeLabel = $dryRun
            ? '<fg=yellow;options=bold>DRY RUN</>'
            : '<fg=green;options=bold>LIVE RUN</>';

        $this->line('');
        $this->line('<options=bold;fg=cyan>WORKSPACE BLOCK CONVERSION CONTEXT</>');
        $this->line(str_repeat('=', 72));
        $this->line(" Source workspace: <options=bold>{$workspace->name}</>");
        $this->line(" Source ID       : <options=bold>{$workspace->id}</>");
        $this->line(" Run mode        : {$modeLabel}");
        $this->line(' Switch mode     : <fg=yellow>IGNORED (copy is always block)</>');
        $this->line(str_repeat('=', 72));

        $sourceNotes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->orderBy('created_at')
            ->get();

        $stats = [
            'notes_total' => $sourceNotes->count(),
            'notes_changed' => 0,
            'notes_skipped' => 0,
            'notes_failed' => 0,
            'already_block' => 0,
            'headings_added' => 0,
        ];

        if ($dryRun) {
            foreach ($sourceNotes as $note) {
                $this->collectConversionStats($stats, $note, $converter);
            }
        } else {
            [$targetWorkspace, $noteIdMap] = $this->duplicateWorkspaceWithNotes($workspace, $sourceNotes);
            $this->line(" Target workspace: <options=bold>{$targetWorkspace->name}</>");
            $this->line(" Target ID       : <options=bold>{$targetWorkspace->id}</>");
            $this->line(' Notes copied    : <fg=cyan>'.count($noteIdMap).'</>');

            $targetNotes = Note::query()
                ->where('workspace_id', $targetWorkspace->id)
                ->orderBy('created_at')
                ->get();

            foreach ($targetNotes as $note) {
                try {
                    $conversion = $converter->convertNote($note);
                } catch (\Throwable $exception) {
                    $stats['notes_failed']++;
                    $this->warn("Failed converting note {$note->id}: {$exception->getMessage()}");

                    continue;
                }

                if ($conversion['was_block_document']) {
                    $stats['already_block']++;
                }

                if (! $conversion['changed']) {
                    $stats['notes_skipped']++;

                    continue;
                }

                $stats['notes_changed']++;
                if ($conversion['added_leading_heading']) {
                    $stats['headings_added']++;
                }

                DB::transaction(function () use ($note, $conversion, $noteTitleExtractor, $noteWordCountExtractor): void {
                    $document = $conversion['document'];
                    $note->content = $document;
                    $note->title = $noteTitleExtractor->extract($document) ?? $note->title;
                    $note->word_count = $noteWordCountExtractor->count($document);
                    $note->save();
                });
            }

            if ($stats['notes_failed'] === 0) {
                $workspace->migrated_at = Carbon::now();
                $workspace->save();
            }

            if ($switchMode) {
                $this->warn('--switch-mode is deprecated and ignored.');
            }
        }

        $this->line('');
        $this->line('<options=bold;fg=cyan>Conversion summary</>');
        $this->line(str_repeat('-', 72));
        $this->line(" Notes total    : <fg=cyan>{$stats['notes_total']}</>");
        $this->line(" Notes changed  : <fg=cyan>{$stats['notes_changed']}</>");
        $this->line(" Notes skipped  : <fg=cyan>{$stats['notes_skipped']}</>");
        $this->line(" Already block  : <fg=cyan>{$stats['already_block']}</>");
        $this->line(" Heading inserts: <fg=cyan>{$stats['headings_added']}</>");
        $this->line(" Notes failed   : <fg=cyan>{$stats['notes_failed']}</>");
        $this->line(str_repeat('-', 72));

        if ($dryRun) {
            $this->line('<fg=yellow>Dry run complete. No notes were updated.</>');
        } elseif ($stats['notes_failed'] === 0) {
            $this->line('<fg=green>Workspace migration complete. Source workspace marked as migrated/read-only.</>');
        } else {
            $this->warn('Workspace migration completed with failures. Source workspace was not marked as migrated.');
        }

        return $stats['notes_failed'] > 0
            ? self::FAILURE
            : self::SUCCESS;
    }

    /**
     * @param  array<string, int>  $stats
     */
    private function collectConversionStats(array &$stats, Note $note, LegacyToBlockNoteConverter $converter): void
    {
        try {
            $conversion = $converter->convertNote($note);
        } catch (\Throwable $exception) {
            $stats['notes_failed']++;
            $this->warn("Failed converting note {$note->id}: {$exception->getMessage()}");

            return;
        }

        if ($conversion['was_block_document']) {
            $stats['already_block']++;
        }

        if (! $conversion['changed']) {
            $stats['notes_skipped']++;

            return;
        }

        $stats['notes_changed']++;
        if ($conversion['added_leading_heading']) {
            $stats['headings_added']++;
        }
    }

    /**
     * @param  Collection<int, Note>  $sourceNotes
     * @return array{0: Workspace, 1: array<string, string>}
     */
    private function duplicateWorkspaceWithNotes(Workspace $sourceWorkspace, Collection $sourceNotes): array
    {
        /** @var array<string, string> $noteIdMap */
        $noteIdMap = [];

        $targetWorkspace = DB::transaction(function () use ($sourceWorkspace, $sourceNotes, &$noteIdMap): Workspace {
            /** @var Workspace $target */
            $target = Workspace::query()->create([
                'owner_id' => $sourceWorkspace->owner_id,
                'name' => $sourceWorkspace->name.' (Block)',
                'color' => $sourceWorkspace->color,
                'timeblock_color' => $sourceWorkspace->timeblock_color,
                'icon' => $sourceWorkspace->icon,
                'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
                'mention_suggestions' => $sourceWorkspace->mention_suggestions,
                'hashtag_suggestions' => $sourceWorkspace->hashtag_suggestions,
            ]);

            $memberships = $sourceWorkspace->users()
                ->select('users.id')
                ->withPivot('role')
                ->get()
                ->mapWithKeys(fn ($user) => [
                    (string) $user->id => ['role' => (string) ($user->pivot->role ?? 'member')],
                ])
                ->all();

            if ($memberships !== []) {
                $target->users()->sync($memberships);
            } else {
                $target->users()->syncWithoutDetaching([
                    $sourceWorkspace->owner_id => ['role' => 'owner'],
                ]);
            }

            foreach ($sourceNotes as $sourceNote) {
                /** @var Note $copiedNote */
                $copiedNote = Note::query()->create([
                    'workspace_id' => $target->id,
                    'parent_id' => null,
                    'type' => $sourceNote->type,
                    'title' => $sourceNote->getRawOriginal('title'),
                    'slug' => $sourceNote->slug,
                    'journal_granularity' => $sourceNote->journal_granularity,
                    'journal_date' => $sourceNote->journal_date?->toDateString(),
                    'content' => $sourceNote->content,
                    'properties' => $sourceNote->properties,
                    'meta' => $sourceNote->meta,
                    'word_count' => $sourceNote->word_count,
                ]);

                $noteIdMap[(string) $sourceNote->id] = (string) $copiedNote->id;
            }

            foreach ($sourceNotes as $sourceNote) {
                if (! $sourceNote->parent_id) {
                    continue;
                }

                $copiedId = $noteIdMap[(string) $sourceNote->id] ?? null;
                $copiedParentId = $noteIdMap[(string) $sourceNote->parent_id] ?? null;

                if (! $copiedId || ! $copiedParentId) {
                    continue;
                }

                Note::query()
                    ->where('id', $copiedId)
                    ->update(['parent_id' => $copiedParentId]);
            }

            foreach ($sourceNotes as $sourceNote) {
                $copiedId = $noteIdMap[(string) $sourceNote->id] ?? null;
                if (! $copiedId) {
                    continue;
                }

                $content = $sourceNote->content;
                if (! is_array($content)) {
                    continue;
                }

                $remapped = $this->remapNoteIdsInContent($content, $noteIdMap);
                if ($remapped !== null) {
                    Note::query()->where('id', $copiedId)->update(['content' => json_encode($remapped)]);
                }
            }

            return $target;
        });

        return [$targetWorkspace, $noteIdMap];
    }

    /**
     * Walk a block-format or legacy-format content tree and remap note IDs in task migration attrs.
     * Returns null if nothing changed, otherwise the updated content array.
     *
     * @param  array<string, mixed>  $content
     * @param  array<string, string>  $noteIdMap
     * @return array<string, mixed>|null
     */
    private function remapNoteIdsInContent(array $content, array $noteIdMap): ?array
    {
        $changed = false;

        $walk = function (array &$node) use ($noteIdMap, &$changed, &$walk): void {
            $attrs = $node['attrs'] ?? null;
            if (is_array($attrs)) {
                foreach (['migratedToNoteId', 'migratedFromNoteId'] as $key) {
                    $oldId = is_string($attrs[$key] ?? null) ? trim((string) $attrs[$key]) : '';
                    if ($oldId !== '' && isset($noteIdMap[$oldId])) {
                        $node['attrs'][$key] = $noteIdMap[$oldId];
                        $changed = true;
                    }
                }
            }

            if (isset($node['content']) && is_array($node['content'])) {
                foreach ($node['content'] as &$child) {
                    if (is_array($child)) {
                        $walk($child);
                    }
                }
                unset($child);
            }
        };

        $walk($content);

        return $changed ? $content : null;
    }
}
