<?php

use App\Jobs\RecalculateDailySignalsJob;
use App\Models\Note;
use App\Models\User;
use Illuminate\Support\Facades\Queue;

test('daily journal note save dispatches recalculation job', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-22',
        'title' => 'Daily',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    Queue::assertPushed(RecalculateDailySignalsJob::class, function (RecalculateDailySignalsJob $job) use ($workspace): bool {
        return $job->workspaceId === $workspace->id
            && $job->dates === ['2026-03-22'];
    });
});

test('daily journal date change dispatches recalculation for old and new date', function () {
    Queue::fake();

    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = Note::query()->create([
        'workspace_id' => $workspace->id,
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-20',
        'title' => 'Daily',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $note->update([
        'journal_date' => '2026-03-21',
    ]);

    Queue::assertPushed(RecalculateDailySignalsJob::class, function (RecalculateDailySignalsJob $job) use ($workspace): bool {
        $dates = $job->dates;
        sort($dates);

        return $job->workspaceId === $workspace->id
            && $dates === ['2026-03-20', '2026-03-21'];
    });
});
