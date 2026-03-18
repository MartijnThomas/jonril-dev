<?php

namespace App\Http\Controllers;

use App\Jobs\SyncCalendarRangeJob;
use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\CalendarSyncedRange;
use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SidebarEventsController extends Controller
{
    public function __construct(private readonly NoteSlugService $noteSlugService) {}

    public function attachable(Request $request, Workspace $workspace): JsonResponse
    {
        abort_unless(
            $workspace->users()->where('users.id', $request->user()->id)->exists(),
            403,
        );

        $userTimezone = $request->user()->timezonePreference();
        $now = now($userTimezone);

        $rangeStart = $now->copy()->subDays(14)->startOfDay()->timezone('UTC');
        $rangeEnd = $now->copy()->addDays(60)->endOfDay()->timezone('UTC');

        // Collect block IDs already linked to a meeting note so we can exclude them.
        $takenBlockIds = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where('type', Note::TYPE_MEETING)
            ->get(['meta'])
            ->map(fn (Note $n) => is_array($n->meta) ? ($n->meta['event_block_id'] ?? null) : null)
            ->filter()
            ->unique()
            ->flip()
            ->all();

        $activeCalendarIds = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->pluck('id');

        $events = Event::query()
            ->with('eventable')
            ->where('workspace_id', $workspace->id)
            ->where('starts_at', '>=', $rangeStart)
            ->where('starts_at', '<=', $rangeEnd)
            ->where(function ($q) use ($activeCalendarIds): void {
                $q->whereNot('eventable_type', CalendarItem::class)
                    ->orWhereHasMorph('eventable', CalendarItem::class, function ($q2) use ($activeCalendarIds): void {
                        $q2->whereIn('calendar_id', $activeCalendarIds);
                    });
            })
            ->orderBy('starts_at')
            ->get()
            ->map(function (Event $event) use ($userTimezone): array {
                $isTimeblock = $event->eventable_type === Timeblock::class;
                $timeblock = $isTimeblock ? $event->eventable : null;
                $calendarItem = $event->eventable_type === CalendarItem::class ? $event->eventable : null;
                $allDay = (bool) $event->all_day;

                return [
                    'block_id' => $event->block_id ?? $event->id,
                    'title' => (string) $event->title,
                    'all_day' => $allDay,
                    'starts_at' => $allDay
                        ? $event->starts_at?->toDateString()
                        : $event->starts_at?->copy()->timezone($userTimezone)->toIso8601String(),
                    'ends_at' => $allDay
                        ? $event->ends_at?->copy()->subDay()->toDateString()
                        : $event->ends_at?->copy()->timezone($userTimezone)->toIso8601String(),
                    'location' => $isTimeblock
                        ? ($timeblock instanceof Timeblock ? $timeblock->location : null)
                        : ($calendarItem?->location ?: null),
                    'timezone' => $userTimezone,
                ];
            })
            ->filter(fn (array $e) => ! isset($takenBlockIds[$e['block_id']]))
            ->values()
            ->all();

        return response()->json(['events' => $events]);
    }

    public function index(Request $request, Workspace $workspace): JsonResponse
    {
        abort_unless(
            $workspace->users()->where('users.id', $request->user()->id)->exists(),
            403,
        );

        $userTimezone = $request->user()->timezonePreference();

        $dateInput = trim((string) $request->query('date', ''));
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateInput) === 1) {
            try {
                $anchorDate = Carbon::createFromFormat('Y-m-d', $dateInput, $userTimezone)->startOfDay();
            } catch (\Throwable) {
                $anchorDate = now($userTimezone)->startOfDay();
            }
        } else {
            $anchorDate = now($userTimezone)->startOfDay();
        }

        $startOfDayUtc = $anchorDate->copy()->timezone($userTimezone)->startOfDay()->timezone('UTC');
        $endOfDayUtc = $anchorDate->copy()->timezone($userTimezone)->endOfDay()->timezone('UTC');

        // Dispatch on-demand syncs for dates outside the normal background-sync window.
        $syncing = $this->dispatchOnDemandSyncsIfNeeded($workspace, $anchorDate, $userTimezone);

        $activeCalendarIds = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->pluck('id');

        // Active (non-deleted) calendar events.
        $rawEvents = Event::query()
            ->with(['eventable', 'note:id,title,slug,type,journal_granularity,journal_date,workspace_id,parent_id,properties'])
            ->where('workspace_id', $workspace->id)
            ->where('starts_at', '<=', $endOfDayUtc)
            ->where('ends_at', '>=', $startOfDayUtc)
            ->whereNull('remote_deleted_at')
            ->where(function ($q) use ($activeCalendarIds): void {
                $q->whereNot('eventable_type', CalendarItem::class)
                    ->orWhereHasMorph('eventable', CalendarItem::class, function ($q2) use ($activeCalendarIds): void {
                        $q2->whereIn('calendar_id', $activeCalendarIds);
                    });
            })
            ->orderBy('starts_at')
            ->orderBy('ends_at')
            ->get()
            ->filter(function (Event $event) use ($anchorDate): bool {
                if ($event->eventable_type !== Timeblock::class) {
                    return true;
                }

                return (string) $event->journal_date?->toDateString() === $anchorDate->toDateString();
            })
            ->map(fn (Event $event) => $this->formatEvent($event, $userTimezone));

        // Remote-deleted calendar events that still have a meeting note — shown
        // with a strikethrough so the user knows the event was removed.
        $deletedEventsWithNotes = Event::query()
            ->with(['eventable'])
            ->where('workspace_id', $workspace->id)
            ->where('starts_at', '<=', $endOfDayUtc)
            ->where('ends_at', '>=', $startOfDayUtc)
            ->whereNotNull('remote_deleted_at')
            ->whereHasMorph('eventable', CalendarItem::class, function ($q2) use ($activeCalendarIds): void {
                $q2->whereIn('calendar_id', $activeCalendarIds);
            })
            ->orderBy('starts_at')
            ->get()
            ->filter(function (Event $event): bool {
                $blockId = $event->block_id ?? $event->id;

                return Note::query()
                    ->where('type', Note::TYPE_MEETING)
                    ->whereNull('deleted_at')
                    ->where('meta->event_block_id', $blockId)
                    ->exists();
            })
            ->map(fn (Event $event) => [
                ...$this->formatEvent($event, $userTimezone),
                'remote_deleted' => true,
            ]);

        $combined = $rawEvents->concat($deletedEventsWithNotes)
            ->sortBy('starts_at')
            ->values();

        $blockIds = $combined->pluck('block_id')->filter()->unique()->values()->all();
        $meetingNoteMap = [];

        if (! empty($blockIds)) {
            Note::query()
                ->where('type', Note::TYPE_MEETING)
                ->where('workspace_id', $workspace->id)
                ->get(['id', 'meta', 'slug', 'type', 'journal_granularity', 'journal_date', 'workspace_id'])
                ->each(function (Note $n) use (&$meetingNoteMap): void {
                    $key = is_array($n->meta) ? ($n->meta['event_block_id'] ?? null) : null;
                    if ($key) {
                        $meetingNoteMap[$key] = [
                            'id' => $n->id,
                            'href' => $this->noteSlugService->urlFor($n),
                        ];
                    }
                });
        }

        $events = $combined->map(function (array $e) use ($meetingNoteMap): array {
            $match = isset($e['block_id']) ? ($meetingNoteMap[$e['block_id']] ?? null) : null;

            return [
                ...$e,
                'meeting_note_id' => $match ? $match['id'] : null,
                'meeting_note_href' => $match ? $match['href'] : null,
            ];
        })->values()->all();

        return response()->json([
            'date' => $anchorDate->toDateString(),
            'events' => $events,
            'syncing' => $syncing,
        ]);
    }

    /**
     * For dates outside the normal −7/+30 day background-sync window, check
     * whether each active calendar has a fresh record for the requested month.
     * If not, dispatch a SyncCalendarRangeJob and return true so the frontend
     * knows to poll for updated events.
     *
     * Months already synced within the last 6 hours are considered fresh and
     * will not trigger a redundant job.
     */
    /**
     * @return array<string, mixed>
     */
    private function formatEvent(Event $event, string $userTimezone): array
    {
        $isTimeblock = $event->eventable_type === Timeblock::class;
        $timeblock = $isTimeblock ? $event->eventable : null;
        $calendarItem = $event->eventable_type === CalendarItem::class ? $event->eventable : null;
        $allDay = (bool) $event->all_day;

        return [
            'id' => $event->id,
            'block_id' => $event->block_id ?? $event->id,
            'type' => $isTimeblock ? 'timeblock' : 'event',
            'all_day' => $allDay,
            'title' => (string) $event->title,
            'note_id' => $event->note_id,
            'starts_at' => $allDay
                ? $event->starts_at?->toDateString()
                : $event->starts_at?->copy()->timezone($userTimezone)->toIso8601String(),
            'ends_at' => $allDay
                ? $event->ends_at?->copy()->subDay()->toDateString()
                : $event->ends_at?->copy()->timezone($userTimezone)->toIso8601String(),
            'location' => $isTimeblock ? $timeblock->location : ($calendarItem?->location ?: null),
            'task_block_id' => $timeblock instanceof Timeblock ? $timeblock->task_block_id : null,
            'task_checked' => $timeblock instanceof Timeblock ? $timeblock->task_checked : null,
            'task_status' => $timeblock instanceof Timeblock ? $timeblock->task_status : null,
            'note_title' => $event->note?->display_title,
            'href' => $event->note ? $this->noteSlugService->urlFor($event->note) : null,
            'timezone' => $userTimezone,
            'remote_deleted' => false,
        ];
    }

    private function dispatchOnDemandSyncsIfNeeded(
        Workspace $workspace,
        \Carbon\CarbonInterface $anchorDate,
        string $userTimezone,
    ): bool {
        $normalWindowStart = now($userTimezone)->subDays(7)->startOfDay();
        $normalWindowEnd = now($userTimezone)->addDays(30)->endOfDay();

        // Within the normal window: the hourly cron handles it.
        if ($anchorDate->betweenIncluded($normalWindowStart, $normalWindowEnd)) {
            return false;
        }

        $period = $anchorDate->format('Y-m');
        $staleThreshold = now()->subHours(6);
        $syncing = false;

        $activeCalendars = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->get(['id']);

        foreach ($activeCalendars as $calendar) {
            $isFresh = CalendarSyncedRange::query()
                ->where('calendar_id', $calendar->id)
                ->where('period', $period)
                ->where('synced_at', '>=', $staleThreshold)
                ->exists();

            if (! $isFresh) {
                SyncCalendarRangeJob::dispatch($calendar, $period);
                $syncing = true;
            }
        }

        return $syncing;
    }
}
