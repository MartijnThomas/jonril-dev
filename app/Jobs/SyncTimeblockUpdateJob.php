<?php

namespace App\Jobs;

use App\Models\Timeblock;
use App\Models\TimeblockCalendarLink;
use App\Services\CalDavService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

class SyncTimeblockUpdateJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public array $backoff = [10, 30, 120, 300];

    public function __construct(public readonly string $timeblockCalendarLinkId)
    {
        $this->onQueue('calendar-sync');
    }

    public function handle(CalDavService $calDavService): void
    {
        $link = TimeblockCalendarLink::query()
            ->with('calendar')
            ->find($this->timeblockCalendarLinkId);

        if (! $link) {
            return;
        }

        if (! in_array($link->sync_status, [TimeblockCalendarLink::STATUS_PENDING_UPDATE, TimeblockCalendarLink::STATUS_PENDING_CREATE], true)) {
            return;
        }

        $calendar = $link->calendar;
        if (! $calendar || ! $calendar->is_active) {
            return;
        }

        $event = $link->event()->first();
        $timeblock = $link->timeblock()->first();
        if (! $event || ! $timeblock instanceof Timeblock) {
            $link->update([
                'sync_status' => TimeblockCalendarLink::STATUS_FAILED,
                'last_error' => 'Missing local event or timeblock for update sync.',
            ]);

            return;
        }

        $lock = Cache::lock("timeblock-sync:update:{$calendar->id}:{$event->id}", 30);
        if (! $lock->get()) {
            $this->release(5);

            return;
        }

        try {
            $result = $calDavService->updateTimeblockEvent($calendar, $link, $event, $timeblock);

            $link->update([
                'timeblock_id' => $event->eventable_id,
                'remote_uid' => $result['uid'],
                'remote_href' => $result['href'],
                'remote_etag' => $result['etag'],
                'sync_status' => TimeblockCalendarLink::STATUS_SYNCED,
                'last_synced_at' => now(),
                'last_error' => null,
            ]);
        } catch (\Throwable $e) {
            $link->update([
                'sync_status' => TimeblockCalendarLink::STATUS_FAILED,
                'last_error' => $e->getMessage(),
            ]);

            if ((string) config('queue.default') !== 'sync') {
                throw $e;
            }
        } finally {
            $lock->release();
        }
    }
}
