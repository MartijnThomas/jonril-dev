<?php

namespace App\Domain\LegacyImport;

use App\Models\LegacyNote;
use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteRevision;
use App\Models\NoteTask;
use App\Models\Workspace;
use Illuminate\Support\Facades\DB;

class ClearWorkspaceContent
{
    /**
     * @return array{
     *     notes:int,
     *     note_tasks:int,
     *     note_headings:int,
     *     note_revisions:int,
     *     legacy_notes:int
     * }
     */
    public function clear(Workspace $workspace, bool $dryRun = false): array
    {
        $noteQuery = Note::query()
            ->withTrashed()
            ->where('workspace_id', $workspace->id);
        $noteIds = $noteQuery->pluck('id')->all();

        $summary = [
            'notes' => count($noteIds),
            'note_tasks' => NoteTask::query()->where('workspace_id', $workspace->id)->count(),
            'note_headings' => NoteHeading::query()->where('workspace_id', $workspace->id)->count(),
            'note_revisions' => NoteRevision::query()->whereIn('note_id', $noteIds)->count(),
            'legacy_notes' => LegacyNote::query()->where('workspace_id', $workspace->id)->count(),
        ];

        if ($dryRun) {
            return $summary;
        }

        DB::transaction(function () use ($workspace, $noteIds): void {
            NoteTask::query()->where('workspace_id', $workspace->id)->delete();
            NoteHeading::query()->where('workspace_id', $workspace->id)->delete();
            LegacyNote::query()->where('workspace_id', $workspace->id)->delete();

            if ($noteIds !== []) {
                NoteRevision::query()->whereIn('note_id', $noteIds)->delete();
            }

            Note::query()
                ->withTrashed()
                ->where('workspace_id', $workspace->id)
                ->forceDelete();
        });

        return $summary;
    }
}
