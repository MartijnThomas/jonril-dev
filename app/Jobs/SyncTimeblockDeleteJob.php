<?php

namespace App\Jobs;

use App\Models\TimeblockCalendarLink;
use App\Services\CalDavService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;

class SyncTimeblockDeleteJob implements ShouldQueue
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

        if (! $link || $link->sync_status !== TimeblockCalendarLink::STATUS_PENDING_DELETE) {
            return;
        }

        $calendar = $link->calendar;
        if (! $calendar || ! $calendar->is_active) {
            return;
        }

        $lock = Cache::lock("timeblock-sync:delete:{$calendar->id}:{$link->event_id}", 30);
        if (! $lock->get()) {
            $this->release(5);

            return;
        }

        try {
            $calDavService->deleteTimeblockEvent($calendar, $link);
            $link->delete();
        } catch (\Throwable $e) {
            $link->update([
                'sync_status' => TimeblockCalendarLink::STATUS_FAILED,
                'last_error' => $e->getMessage(),
            ]);

            throw $e;
        } finally {
            $lock->release();
        }
    }
}
