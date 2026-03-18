# Queue & Async Candidates

Updated: 2026-03-18

---

## Cache driver

Since Redis is already running for Horizon queues, use it for the cache driver too. No additional infrastructure needed.

```env
CACHE_STORE=redis
```

Benefits over the default `file` driver:
- Sub-millisecond reads (in-memory vs disk)
- Native TTL — keys expire automatically without a garbage-collection sweep
- Atomic operations — no race conditions when multiple workers write the same key
- Laravel cache tags — useful if you want grouped invalidation in the future
- Already provisioned on Forge; zero extra cost

---

## What runs synchronously today that shouldn't

### 1. Note indexing in `NoteObserver::saved()` — ✓ Implemented 2026-03-18

Every time a note is saved (autosave, task toggle, title edit, migration), three indexers run inline:

| Indexer | Cost | Triggers |
|---|---|---|
| `NoteTaskIndexer::reindexNote()` | Medium-heavy — DELETE + recursive tree walk + regex per task + batch INSERT | Every save |
| `NoteHeadingIndexer::reindexNote()` | Light — DELETE + INSERT | Every save |
| `TimeblockIndexer::reindexNote()` | Medium — transaction, DELETE events + timeblocks, INSERT, timezone math | Every save |

None of these results are returned in the same HTTP response. The task/heading/timeblock indices are only consumed on the next page load or via the deferred `related-panel` group. They are safe to compute asynchronously.

**Recommendation:** Extract a single `ReindexNoteJob` dispatched from `NoteObserver::saved()`:

```php
// NoteObserver::saved()
public function saved(Note $note): void
{
    ReindexNoteJob::dispatch($note->id);

    if ($note->wasChanged('title')) {
        $note->children()->each(fn (Note $child) => ReindexNoteJob::dispatch($child->id));
    }

    if ($note->wasRecentlyCreated || $note->wasChanged('title') || $note->wasChanged('parent_id') || $note->wasChanged('type')) {
        $this->clearNoteSharedCache($note->workspace_id);
    }
}
```

```php
// app/Jobs/ReindexNoteJob.php
class ReindexNoteJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public readonly string $noteId) {}

    public function handle(
        NoteTaskIndexer $taskIndexer,
        NoteHeadingIndexer $headingIndexer,
        TimeblockIndexer $timeblockIndexer,
    ): void {
        $note = Note::withTrashed()->find($this->noteId);
        if (! $note) {
            return;
        }

        $defaultDuration = $note->workspace->defaultTimeblockDurationMinutes();
        $timezone = null; // or derive from workspace settings

        $taskIndexer->reindexNote($note);
        $headingIndexer->reindexNote($note);
        $timeblockIndexer->reindexNote($note, $defaultDuration, $timezone);
    }
}
```

**Impact:** Autosave response time drops from ~100–300ms (with a large note) to ~20–40ms. The index is stale for a few hundred milliseconds while the job runs — acceptable since it is never read in the same request that caused the save.

**Caveat — task toggle:** `TasksController::updateChecked` calls `$note->save()` and then the related panel reloads. The related panel uses `relatedTasks` which reads from the NoteTask index. If the job is still queued when the reload fires, the panel will briefly show stale data. Mitigation: use a short queue with high throughput (dedicated `indexing` queue on Horizon) so jobs complete within ~100ms of dispatch.

---

### 2. Child note reindexing on title change — ✓ Implemented 2026-03-18

When a note title is renamed, all child notes are currently reindexed synchronously:

```php
// Current: blocks the response
$note->children()->each(function (Note $child): void {
    $this->noteTaskIndexer->reindexNote($child);
});
```

With `ReindexNoteJob` in place, this becomes a fan-out of dispatches — each child gets its own job and they process in parallel on Horizon workers. For a note with 50 children, this is the difference between a 5-second rename and an instant one.

---

### 3. CalDAV sync — `CalDavService::sync()`

CalDAV sync makes an outbound HTTP request to a remote calendar server. Remote latency is typically 200–800ms and can spike. This currently runs in-request.

**Recommendation:** Dispatch a `SyncCalendarJob` and return immediately. The sync result is never needed in the same response.

```php
SyncCalendarJob::dispatch($workspace->id, $targetDate);
```

If CalDAV sync is already running via a scheduled command, verify it is not also triggered inline during note/event page loads.

---

### 4. Note slug sync — `NoteSlugService::syncSingleNote()`

Called in `NotesController` before rendering a note page. Walks the parent hierarchy to build a path-based slug, then runs a uniqueness loop with repeated `EXISTS` queries.

Currently fast for shallow hierarchies (2–3 queries) but can spike with deep hierarchies or many slug collisions. Not needed for the immediate render — the slug is only used for URL generation in subsequent navigations.

**Recommendation:** Lower priority. Consider moving to a queued job dispatched after `$note->save()` when `title` or `parent_id` changes, then use the stored slug (which is already on the model) for rendering.

---

### 5. Cache warming after invalidation

When `NoteObserver::clearNoteSharedCache()` runs (note create/rename/move/delete), four cache keys are dropped:

- `notes_tree_{workspaceId}`
- `notes_count_{workspaceId}`
- `notes_dropdown_linkable_{workspaceId}`
- `notes_dropdown_parents_{workspaceId}`

The next request that hits the middleware re-builds the tree from scratch. For large workspaces this can be 200–500ms of cold-cache latency.

**Recommendation:** After invalidating, dispatch a `WarmNoteSharedCacheJob` that pre-builds and stores the new tree/count values. The first post-save request then hits a warm cache.

---

## Suggested Horizon queue configuration

```php
// config/horizon.php — add a dedicated indexing queue
'environments' => [
    'production' => [
        'supervisor-default' => [
            'connection' => 'redis',
            'queue' => ['default'],
            'balance' => 'auto',
            'processes' => 3,
        ],
        'supervisor-indexing' => [
            'connection' => 'redis',
            'queue' => ['indexing'],
            'balance' => 'auto',
            'minProcesses' => 1,
            'maxProcesses' => 5,
            'tries' => 3,
        ],
    ],
],
```

Dispatch `ReindexNoteJob` on the `indexing` queue so it never blocks user-facing jobs. High throughput and low latency on this queue ensures indices are consistent within seconds.

---

## What to keep synchronous

| Operation | Why keep sync |
|---|---|
| `NoteTaskCountExtractor::count()` in `saving()` | Sets `meta['task_counts']` which is part of the saved note row — must run before `INSERT`/`UPDATE` |
| `NoteWordCountExtractor::count()` in `saving()` | Same — sets `meta['word_count']` |
| `NoteMetaExtractor::extract()` in `saving()` | Extracts `event_block_id`, `starts_at` etc. into meta — required for the saved record |
| Cache key invalidation in `saved()` | Cheap (single Redis DEL per key), safe to run inline |

---

## Implementation order

1. **Switch `CACHE_STORE=redis`** — zero code change, immediate win
2. ~~**`ReindexNoteJob`**~~ ✓ Done — dispatched from `NoteObserver::saved()` and `restored()`, routes to `indexing` queue, snapshots `Auth::id()` at dispatch time
3. **`WarmNoteSharedCacheJob`** — eliminates cold-cache spike after writes
4. **`SyncCalendarJob`** (if not already queued) — removes remote latency from request path
5. **Slug sync to queue** — lower priority; only affects deep hierarchies
