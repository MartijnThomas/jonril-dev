<?php

namespace App\Domain\LegacyImport;

use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\CalendarSyncedRange;
use App\Models\Event;
use App\Models\LegacyNote;
use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteRevision;
use App\Models\NoteTask;
use App\Models\Timeblock;
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
     *     legacy_notes:int,
     *     events:int,
     *     timeblocks:int,
     *     calendars:int,
     *     calendar_items:int,
     *     calendar_synced_ranges:int
     * }
     */
    public function clear(
        Workspace $workspace,
        bool $dryRun = false,
        bool $includeCalendars = false,
    ): array {
        $noteQuery = Note::query()
            ->withTrashed()
            ->where('workspace_id', $workspace->id);
        $noteIds = $noteQuery->pluck('id')->all();
        $calendarIds = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->pluck('id')
            ->all();
        $timeblockIds = Event::query()
            ->where('workspace_id', $workspace->id)
            ->where('eventable_type', Timeblock::class)
            ->pluck('eventable_id')
            ->all();

        $summary = [
            'notes' => count($noteIds),
            'note_tasks' => NoteTask::query()->where('workspace_id', $workspace->id)->count(),
            'note_headings' => NoteHeading::query()->where('workspace_id', $workspace->id)->count(),
            'note_revisions' => NoteRevision::query()->whereIn('note_id', $noteIds)->count(),
            'legacy_notes' => LegacyNote::query()->where('workspace_id', $workspace->id)->count(),
            'events' => Event::query()->where('workspace_id', $workspace->id)->count(),
            'timeblocks' => Timeblock::query()->whereIn('id', $timeblockIds)->count(),
            'calendars' => Calendar::query()->whereIn('id', $calendarIds)->count(),
            'calendar_items' => CalendarItem::query()->whereIn('calendar_id', $calendarIds)->count(),
            'calendar_synced_ranges' => CalendarSyncedRange::query()->whereIn('calendar_id', $calendarIds)->count(),
        ];

        if ($dryRun) {
            return $summary;
        }

        DB::transaction(function () use ($workspace, $noteIds, $calendarIds, $timeblockIds, $includeCalendars): void {
            NoteTask::query()->where('workspace_id', $workspace->id)->delete();
            NoteHeading::query()->where('workspace_id', $workspace->id)->delete();
            LegacyNote::query()->where('workspace_id', $workspace->id)->delete();
            Event::query()->where('workspace_id', $workspace->id)->delete();

            if ($timeblockIds !== []) {
                Timeblock::query()->whereIn('id', $timeblockIds)->delete();
            }

            if ($calendarIds !== []) {
                CalendarItem::query()->whereIn('calendar_id', $calendarIds)->delete();
                CalendarSyncedRange::query()->whereIn('calendar_id', $calendarIds)->delete();

                if ($includeCalendars) {
                    Calendar::query()->whereIn('id', $calendarIds)->delete();
                }
            }

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
