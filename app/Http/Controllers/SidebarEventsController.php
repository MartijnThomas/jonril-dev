<?php

namespace App\Http\Controllers;

use App\Jobs\RecalculateDailySignalsJob;
use App\Jobs\SyncCalendarRangeJob;
use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\CalendarSyncedRange;
use App\Models\Event;
use App\Models\Note;
use App\Models\NoteTask;
use App\Models\Timeblock;
use App\Models\Workspace;
use App\Models\WorkspaceDailyIndicator;
use App\Support\Notes\NoteSlugService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

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
            ->where(function ($q): void {
                $q->whereNull('meta->event_type')
                    ->orWhere('meta->event_type', '!=', 'birthday');
            })
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
            ->where(function ($query) use ($anchorDate, $endOfDayUtc, $startOfDayUtc): void {
                $query
                    ->where(function ($rangeQuery) use ($endOfDayUtc, $startOfDayUtc): void {
                        $rangeQuery
                            ->where('starts_at', '<=', $endOfDayUtc)
                            ->where('ends_at', '>=', $startOfDayUtc)
                            ->where(function ($nonBirthdayQuery): void {
                                $nonBirthdayQuery
                                    ->whereNull('meta->event_type')
                                    ->orWhere('meta->event_type', '!=', 'birthday');
                            });
                    })
                    ->orWhere(function ($birthdayQuery) use ($anchorDate): void {
                        $birthdayQuery
                            ->where('meta->event_type', 'birthday')
                            ->where('meta->birthday_month', (int) $anchorDate->month)
                            ->where('meta->birthday_day', (int) $anchorDate->day);
                    });
            })
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
            ->loadMorph('eventable', [
                CalendarItem::class => ['calendar:id,color'],
            ])
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
            ->loadMorph('eventable', [
                CalendarItem::class => ['calendar:id,color'],
            ])
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
                ->with('workspace:id,slug')
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

    public function indicators(Request $request, Workspace $workspace): JsonResponse
    {
        abort_unless(
            $workspace->users()->where('users.id', $request->user()->id)->exists(),
            403,
        );

        $userTimezone = $request->user()->timezonePreference();
        $start = trim((string) $request->query('start', ''));
        $end = trim((string) $request->query('end', ''));

        if (
            preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) !== 1
            || preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) !== 1
        ) {
            return response()->json(['message' => 'Invalid date range.'], 422);
        }

        try {
            $startDate = Carbon::createFromFormat('Y-m-d', $start, $userTimezone)->startOfDay();
            $endDate = Carbon::createFromFormat('Y-m-d', $end, $userTimezone)->startOfDay();
        } catch (\Throwable) {
            return response()->json(['message' => 'Invalid date range.'], 422);
        }

        if ($endDate->lt($startDate)) {
            return response()->json(['message' => 'Invalid date range.'], 422);
        }

        if ($startDate->diffInDays($endDate) > 62) {
            return response()->json(['message' => 'Date range too large.'], 422);
        }

        $projection = $this->readProjectionIndicators($workspace, $startDate, $endDate, $userTimezone);
        $this->dispatchMissingIndicatorDates($workspace, $startDate, $endDate, $projection['pending_dates']);

        return response()->json([
            'start' => $startDate->toDateString(),
            'end' => $endDate->toDateString(),
            'days' => $projection['days'],
            'pending_dates' => $projection['pending_dates'],
            'pending_count' => count($projection['pending_dates']),
            'version' => $projection['version'],
            'polling_ms' => $projection['pending_dates'] === [] ? 300000 : 2000,
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
        $eventType = strtolower(trim((string) data_get($event->meta, 'event_type', '')));
        $allDay = (bool) $event->all_day;
        $birthdayYear = $eventType === 'birthday'
            ? $this->extractBirthdayYear(data_get($event->meta, 'birthday_value'))
            : null;
        $birthdayAge = null;
        if ($birthdayYear !== null && $event->starts_at) {
            $birthdayAge = max(0, (int) $event->starts_at->copy()->timezone($userTimezone)->year - $birthdayYear);
        }

        return [
            'id' => $event->id,
            'block_id' => $event->block_id ?? $event->id,
            'type' => $eventType === 'birthday'
                ? 'birthday'
                : ($isTimeblock ? 'timeblock' : 'event'),
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
            'birthday_age' => $birthdayAge,
            'calendar_color' => $calendarItem?->calendar?->color,
        ];
    }

    private function extractBirthdayYear(mixed $rawBirthdayValue): ?int
    {
        $rawBirthday = trim((string) $rawBirthdayValue);
        if ($rawBirthday === '') {
            return null;
        }

        if (preg_match('/^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/', $rawBirthday, $parts) !== 1) {
            return null;
        }

        $year = (int) ($parts['year'] ?? 0);
        $month = (int) ($parts['month'] ?? 0);
        $day = (int) ($parts['day'] ?? 0);

        if (! checkdate($month, $day, $year)) {
            return null;
        }

        return $year;
    }

    /**
     * @return array<string, array{has_note: bool, has_events: bool, task_state: 'none'|'all_completed'|'open'|'open_past'}>
     */
    private function buildIndicatorsForRange(
        Workspace $workspace,
        Carbon $startDate,
        Carbon $endDate,
        string $userTimezone,
    ): array {
        $range = [];
        $cursor = $startDate->copy();
        while ($cursor->lte($endDate)) {
            $range[$cursor->toDateString()] = [
                'has_note' => false,
                'has_events' => false,
                'task_state' => 'none',
            ];
            $cursor = $cursor->addDay();
        }

        $startUtc = $startDate->copy()->startOfDay()->timezone('UTC');
        $endUtc = $endDate->copy()->endOfDay()->timezone('UTC');

        $dailyNotes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where('type', Note::TYPE_JOURNAL)
            ->where('journal_granularity', Note::JOURNAL_DAILY)
            ->whereDate('journal_date', '>=', $startDate->toDateString())
            ->whereDate('journal_date', '<=', $endDate->toDateString())
            ->get(['id', 'journal_date']);

        $dailyNoteDateById = [];
        foreach ($dailyNotes as $note) {
            $date = $note->journal_date?->toDateString();
            if ($date === null || ! isset($range[$date])) {
                continue;
            }

            $range[$date]['has_note'] = true;
            $dailyNoteDateById[$note->id] = $date;
        }

        $activeCalendarIds = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->pluck('id');

        $events = Event::query()
            ->where('workspace_id', $workspace->id)
            ->whereNull('remote_deleted_at')
            ->where('starts_at', '<=', $endUtc)
            ->where('ends_at', '>=', $startUtc)
            ->where(function ($q) use ($activeCalendarIds): void {
                $q->whereNot('eventable_type', CalendarItem::class)
                    ->orWhereHasMorph('eventable', CalendarItem::class, function ($q2) use ($activeCalendarIds): void {
                        $q2->whereIn('calendar_id', $activeCalendarIds);
                    });
            })
            ->get(['starts_at', 'ends_at', 'all_day']);

        foreach ($events as $event) {
            if ($event->starts_at === null || $event->ends_at === null) {
                continue;
            }

            $eventStartDate = $event->starts_at->copy()->timezone($userTimezone)->startOfDay();
            $eventEndDate = $event->all_day
                ? $event->ends_at->copy()->timezone($userTimezone)->subDay()->startOfDay()
                : $event->ends_at->copy()->timezone($userTimezone)->startOfDay();

            if ($eventEndDate->lt($eventStartDate)) {
                $eventEndDate = $eventStartDate->copy();
            }

            $loopStart = $eventStartDate->lt($startDate) ? $startDate->copy() : $eventStartDate->copy();
            $loopEnd = $eventEndDate->gt($endDate) ? $endDate->copy() : $eventEndDate->copy();

            if ($loopEnd->lt($loopStart)) {
                continue;
            }

            $eventCursor = $loopStart;
            while ($eventCursor->lte($loopEnd)) {
                $key = $eventCursor->toDateString();
                if (isset($range[$key])) {
                    $range[$key]['has_events'] = true;
                }
                $eventCursor = $eventCursor->addDay();
            }
        }

        $dailyNoteIds = array_keys($dailyNoteDateById);
        $tasks = NoteTask::query()
            ->where('workspace_id', $workspace->id)
            ->where(function ($query) use ($dailyNoteIds, $startDate, $endDate): void {
                $query->where(function ($dueQuery) use ($startDate, $endDate): void {
                    $dueQuery
                        ->whereDate('due_date', '>=', $startDate->toDateString())
                        ->whereDate('due_date', '<=', $endDate->toDateString());
                });

                $query->orWhere(function ($deadlineQuery) use ($startDate, $endDate): void {
                    $deadlineQuery
                        ->whereDate('deadline_date', '>=', $startDate->toDateString())
                        ->whereDate('deadline_date', '<=', $endDate->toDateString());
                });

                if ($dailyNoteIds !== []) {
                    $query->orWhereIn('note_id', $dailyNoteIds);
                }
            })
            ->get(['id', 'note_id', 'checked', 'task_status', 'due_date', 'deadline_date']);

        /** @var array<string, array<string, array{checked: bool, task_status: string|null}>> $tasksByDate */
        $tasksByDate = [];
        foreach ($tasks as $task) {
            $taskPayload = [
                'checked' => (bool) $task->checked,
                'task_status' => is_string($task->task_status) ? strtolower(trim($task->task_status)) : null,
            ];

            $taskDates = [];
            if ($task->due_date !== null) {
                $taskDates[] = $task->due_date->toDateString();
            }
            if ($task->deadline_date !== null) {
                $taskDates[] = $task->deadline_date->toDateString();
            }
            $dailyNoteDate = $dailyNoteDateById[$task->note_id] ?? null;
            if (is_string($dailyNoteDate)) {
                $taskDates[] = $dailyNoteDate;
            }

            foreach (array_unique($taskDates) as $taskDate) {
                if (! isset($range[$taskDate])) {
                    continue;
                }

                $tasksByDate[$taskDate] ??= [];
                $tasksByDate[$taskDate][$task->id] = $taskPayload;
            }
        }

        $today = now($userTimezone)->startOfDay();
        foreach ($tasksByDate as $date => $dateTasks) {
            $hasOpen = false;
            $hasCompletable = false;

            foreach ($dateTasks as $taskData) {
                $status = (string) ($taskData['task_status'] ?? '');
                $isIgnored = ! $taskData['checked'] && in_array($status, ['canceled', 'migrated'], true);

                if ($isIgnored) {
                    continue;
                }

                $hasCompletable = true;
                if (! $taskData['checked']) {
                    $hasOpen = true;
                    break;
                }
            }

            if (! $hasCompletable) {
                $range[$date]['task_state'] = 'none';

                continue;
            }

            if ($hasOpen) {
                $range[$date]['task_state'] = Carbon::createFromFormat('Y-m-d', $date, $userTimezone)->lt($today)
                    ? 'open_past'
                    : 'open';

                continue;
            }

            $range[$date]['task_state'] = 'all_completed';
        }

        return $range;
    }

    /**
     * @return array{
     *     days: array<string, array{has_note: bool, has_events: bool, task_state: 'none'|'all_completed'|'open'|'open_past'}>,
     *     pending_dates: array<int, string>,
     *     version: string
     * }
     */
    private function readProjectionIndicators(
        Workspace $workspace,
        Carbon $startDate,
        Carbon $endDate,
        string $userTimezone,
    ): array {
        $range = [];
        $cursor = $startDate->copy();
        while ($cursor->lte($endDate)) {
            $range[$cursor->toDateString()] = [
                'has_note' => false,
                'has_events' => false,
                'task_state' => 'none',
            ];
            $cursor = $cursor->addDay();
        }

        $rows = WorkspaceDailyIndicator::query()
            ->where('workspace_id', $workspace->id)
            ->whereDate('date', '>=', $startDate->toDateString())
            ->whereDate('date', '<=', $endDate->toDateString())
            ->get(['date', 'has_note', 'has_events', 'work_state', 'updated_at'])
            ->keyBy(fn (WorkspaceDailyIndicator $indicator): string => $indicator->date->toDateString());

        foreach ($rows as $date => $indicator) {
            if (! isset($range[$date])) {
                continue;
            }

            $range[$date] = [
                'has_note' => (bool) $indicator->has_note,
                'has_events' => (bool) $indicator->has_events,
                'task_state' => $this->mapWorkStateToTaskState($indicator->work_state, $date, $userTimezone),
            ];
        }

        $missingDates = array_values(array_diff(array_keys($range), $rows->keys()->all()));
        $maxUpdatedAt = $rows->max(fn (WorkspaceDailyIndicator $indicator) => $indicator->updated_at?->getTimestamp() ?? 0);
        $version = "{$maxUpdatedAt}:{$rows->count()}";

        return [
            'days' => $range,
            'pending_dates' => $missingDates,
            'version' => $version,
        ];
    }

    /**
     * @param  'none'|'all_completed'|'open'|'open_past'  $taskState
     */
    private function mapTaskStateToWorkState(string $taskState): ?string
    {
        return match ($taskState) {
            'all_completed' => 'green',
            'open' => 'orange',
            'open_past' => 'red',
            default => null,
        };
    }

    /**
     * @return 'none'|'all_completed'|'open'|'open_past'
     */
    private function mapWorkStateToTaskState(?string $workState, string $date, string $userTimezone): string
    {
        $isPast = Carbon::createFromFormat('Y-m-d', $date, $userTimezone)->lt(now($userTimezone)->startOfDay());

        return match ($workState) {
            'green' => 'all_completed',
            'orange' => $isPast ? 'open_past' : 'open',
            'red' => 'open_past',
            default => 'none',
        };
    }

    private function dispatchOnDemandSyncsIfNeeded(
        Workspace $workspace,
        \Carbon\CarbonInterface $anchorDate,
        string $userTimezone,
    ): bool {
        $syncPeriodStartDays = max((int) config('calendar.sync_period.start', 7), 0);
        $syncPeriodEndDays = max((int) config('calendar.sync_period.end', 30), 0);

        $normalWindowStart = now($userTimezone)->subDays($syncPeriodStartDays)->startOfDay();
        $normalWindowEnd = now($userTimezone)->addDays($syncPeriodEndDays)->endOfDay();

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

    /**
     * @param  array<int, string>  $missingDates
     */
    private function dispatchMissingIndicatorDates(
        Workspace $workspace,
        Carbon $startDate,
        Carbon $endDate,
        array $missingDates,
    ): void {
        if ($missingDates === []) {
            return;
        }

        $lockKey = implode(':', [
            'sidebar-indicators-hydrate',
            (string) $workspace->id,
            $startDate->toDateString(),
            $endDate->toDateString(),
        ]);

        if (! Cache::add($lockKey, '1', now()->addSeconds(10))) {
            return;
        }

        RecalculateDailySignalsJob::dispatch($workspace->id, $missingDates);
    }
}
