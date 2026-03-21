<?php

namespace App\Services;

use App\Jobs\SyncTimeblockCreateJob;
use App\Jobs\SyncTimeblockDeleteJob;
use App\Jobs\SyncTimeblockUpdateJob;
use App\Models\Calendar;
use App\Models\Event;
use App\Models\Note;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Support\Workspaces\PersonalWorkspaceResolver;

class TimeblockCalendarSyncService
{
    public function __construct(
        private readonly PersonalWorkspaceResolver $personalWorkspaceResolver,
    ) {}

    /**
     * @param  array{
     *   created_event_ids: array<int, string>,
     *   updated_event_ids: array<int, string>,
     *   deleted_event_ids: array<int, string>
     * }  $delta
     */
    public function queueNoteTimeblockChanges(Note $note, ?User $user, array $delta): void
    {
        $calendar = $this->resolveOutboundCalendar($user);
        if (! $calendar) {
            return;
        }

        if ($calendar->workspace_id !== $note->workspace_id) {
            return;
        }

        $linkIds = array_values(array_unique(array_merge(
            $this->queueCreateLinks($calendar, $delta['created_event_ids'] ?? []),
            $this->queueUpdateLinks($calendar, $delta['updated_event_ids'] ?? []),
            $this->queueDeleteLinks($calendar, $delta['deleted_event_ids'] ?? []),
        )));

        if ($linkIds !== [] && $this->shouldDispatchImmediately()) {
            $this->dispatchLinks($linkIds, force: true);
        }
    }

    public function retryFailedForCalendar(Calendar $calendar): int
    {
        $failedLinks = TimeblockCalendarLink::query()
            ->where('calendar_id', $calendar->id)
            ->where('sync_status', TimeblockCalendarLink::STATUS_FAILED)
            ->get(['id', 'event_id', 'remote_uid', 'remote_href']);

        if ($failedLinks->isEmpty()) {
            return 0;
        }

        foreach ($failedLinks as $link) {
            $nextStatus = $this->inferRetryStatus($link);

            $link->update([
                'sync_status' => $nextStatus,
                'last_error' => null,
            ]);
        }

        $linkIds = $failedLinks->pluck('id')->map(static fn ($id): string => (string) $id)->all();
        $this->dispatchLinks($linkIds, force: true);

        return count($linkIds);
    }

    public function relinkExistingForCalendar(Calendar $calendar): int
    {
        $events = Event::query()
            ->where('workspace_id', $calendar->workspace_id)
            ->where('eventable_type', \App\Models\Timeblock::class)
            ->get(['id', 'workspace_id', 'note_id', 'eventable_id']);

        if ($events->isEmpty()) {
            return 0;
        }

        $linkIds = [];

        foreach ($events as $event) {
            $existing = TimeblockCalendarLink::query()
                ->where('event_id', $event->id)
                ->where('calendar_id', $calendar->id)
                ->first();

            if ($existing) {
                continue;
            }

            $uid = "jonril-timeblock-{$event->id}";
            $href = $this->buildTimeblockHref((string) $calendar->url, $uid);

            $link = TimeblockCalendarLink::query()->create([
                'workspace_id' => $event->workspace_id,
                'calendar_id' => $calendar->id,
                'note_id' => (string) $event->note_id,
                'event_id' => (string) $event->id,
                'timeblock_id' => (string) $event->eventable_id,
                'remote_uid' => $uid,
                'remote_href' => $href,
                'remote_etag' => null,
                'sync_status' => TimeblockCalendarLink::STATUS_PENDING_UPDATE,
                'last_error' => null,
            ]);

            $linkIds[] = (string) $link->id;
        }

        if ($linkIds === []) {
            return 0;
        }

        $this->dispatchLinks($linkIds, force: true);

        return count($linkIds);
    }

    private function resolveOutboundCalendar(?User $user): ?Calendar
    {
        if (! $user) {
            return null;
        }

        $personalWorkspace = $this->personalWorkspaceResolver->resolveFor($user);
        if (! $personalWorkspace) {
            return null;
        }

        $calendarId = data_get($user->settings, 'calendar.outbound_timeblock_calendar_id');
        if (! is_string($calendarId) || trim($calendarId) === '') {
            return null;
        }

        return Calendar::query()
            ->where('id', trim($calendarId))
            ->where('workspace_id', $personalWorkspace->id)
            ->where('is_active', true)
            ->first();
    }

    /**
     * @param  array<int, string>  $eventIds
     * @return array<int, string>
     */
    private function queueCreateLinks(Calendar $calendar, array $eventIds): array
    {
        if ($eventIds === []) {
            return [];
        }

        $events = Event::query()
            ->whereIn('id', $eventIds)
            ->where('eventable_type', \App\Models\Timeblock::class)
            ->get(['id', 'workspace_id', 'note_id', 'eventable_id']);

        $linkIds = [];

        foreach ($events as $event) {
            $link = TimeblockCalendarLink::query()->updateOrCreate(
                [
                    'event_id' => $event->id,
                    'calendar_id' => $calendar->id,
                ],
                [
                    'workspace_id' => $event->workspace_id,
                    'note_id' => (string) $event->note_id,
                    'timeblock_id' => (string) $event->eventable_id,
                    'sync_status' => TimeblockCalendarLink::STATUS_PENDING_CREATE,
                    'last_error' => null,
                ],
            );
            $linkIds[] = (string) $link->id;
        }

        return $linkIds;
    }

    /**
     * @param  array<int, string>  $eventIds
     * @return array<int, string>
     */
    private function queueUpdateLinks(Calendar $calendar, array $eventIds): array
    {
        if ($eventIds === []) {
            return [];
        }

        $events = Event::query()
            ->whereIn('id', $eventIds)
            ->where('eventable_type', \App\Models\Timeblock::class)
            ->get(['id', 'workspace_id', 'note_id', 'eventable_id']);

        $linkIds = [];

        foreach ($events as $event) {
            $existing = TimeblockCalendarLink::query()
                ->where('event_id', $event->id)
                ->where('calendar_id', $calendar->id)
                ->first();

            $nextStatus = $existing?->sync_status === TimeblockCalendarLink::STATUS_PENDING_CREATE
                ? TimeblockCalendarLink::STATUS_PENDING_CREATE
                : TimeblockCalendarLink::STATUS_PENDING_UPDATE;

            $link = TimeblockCalendarLink::query()->updateOrCreate(
                [
                    'event_id' => $event->id,
                    'calendar_id' => $calendar->id,
                ],
                [
                    'workspace_id' => $event->workspace_id,
                    'note_id' => (string) $event->note_id,
                    'timeblock_id' => (string) $event->eventable_id,
                    'sync_status' => $nextStatus,
                    'last_error' => null,
                ],
            );
            $linkIds[] = (string) $link->id;
        }

        return $linkIds;
    }

    /**
     * @param  array<int, string>  $eventIds
     * @return array<int, string>
     */
    private function queueDeleteLinks(Calendar $calendar, array $eventIds): array
    {
        if ($eventIds === []) {
            return [];
        }

        $links = TimeblockCalendarLink::query()
            ->where('calendar_id', $calendar->id)
            ->whereIn('event_id', $eventIds)
            ->get(['id']);

        if ($links->isNotEmpty()) {
            TimeblockCalendarLink::query()
                ->whereIn('id', $links->pluck('id')->all())
                ->update([
                    'sync_status' => TimeblockCalendarLink::STATUS_PENDING_DELETE,
                    'last_error' => null,
                ]);
        }

        return $links->pluck('id')->map(static fn ($id): string => (string) $id)->all();
    }

    /**
     * @param  array<int, string>  $linkIds
     */
    private function dispatchLinks(array $linkIds, bool $force = false): void
    {
        if (! $force && ! $this->shouldDispatchImmediately()) {
            return;
        }

        $links = TimeblockCalendarLink::query()
            ->whereIn('id', $linkIds)
            ->get(['id', 'sync_status']);

        foreach ($links as $link) {
            if ($link->sync_status === TimeblockCalendarLink::STATUS_PENDING_CREATE) {
                SyncTimeblockCreateJob::dispatch($link->id);

                continue;
            }

            if ($link->sync_status === TimeblockCalendarLink::STATUS_PENDING_UPDATE) {
                SyncTimeblockUpdateJob::dispatch($link->id);

                continue;
            }

            if ($link->sync_status === TimeblockCalendarLink::STATUS_PENDING_DELETE) {
                SyncTimeblockDeleteJob::dispatch($link->id);
            }
        }
    }

    private function shouldDispatchImmediately(): bool
    {
        return (string) config('timeblocks.outbound.dispatch', 'immediate') === 'immediate';
    }

    private function inferRetryStatus(TimeblockCalendarLink $link): string
    {
        $eventExists = Event::query()
            ->where('id', $link->event_id)
            ->where('eventable_type', \App\Models\Timeblock::class)
            ->exists();

        if (! $eventExists) {
            return TimeblockCalendarLink::STATUS_PENDING_DELETE;
        }

        $hasRemoteIdentity = is_string($link->remote_uid) && trim($link->remote_uid) !== ''
            || is_string($link->remote_href) && trim($link->remote_href) !== '';

        return $hasRemoteIdentity
            ? TimeblockCalendarLink::STATUS_PENDING_UPDATE
            : TimeblockCalendarLink::STATUS_PENDING_CREATE;
    }

    private function buildTimeblockHref(string $calendarUrl, string $uid): string
    {
        $base = rtrim($calendarUrl, '/');
        $safeUid = rawurlencode($uid);

        return "{$base}/{$safeUid}.ics";
    }
}
