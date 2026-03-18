# Deferred Props Plan + Payload Inventory (Notes App)

Updated: 2026-03-18

---

## 1) Proposed approach for deferred/background props

Goal: reduce initial note-open payload and time-to-interactive without breaking editor behavior.

### Principles
- Keep editor-critical data in initial payload.
- Defer non-critical panel data (right after first paint).
- Use explicit skeleton/collapsible placeholders for deferred UI.
- Keep autosave flow stable (no full Inertia page replacement during same-note save).
- Prefer partial reloads for targeted updates.

### Rollout plan

#### Phase 1 — Implemented ✓
- Defer `relatedTasks` and `backlinks` in `notes/show` using Inertia deferred props group `related-panel`.
- Show initial related-panel placeholder skeleton until deferred group loads.
- Update tests to assert deferred data through `loadDeferredProps('related-panel')`.
- Add server-side cache for shared `translations.ui` per locale.
  - Local dev: no cache (instant translation edit feedback).
  - Non-local envs: cached (12h) with deploy-aware invalidation via asset version signature and file-mtime fallback.

#### Phase 2 — High priority candidates

**A. Defer `linkableNotes`** ✓ Implemented 2026-03-18
Deferred `linkableNotes` to the `editor-suggestions` group alongside `workspaceSuggestions`. The suggest menu simply does not open until the deferred load resolves — existing behavior is identical. No skeleton needed. Payload reduction: several KB to tens of KB depending on note count.

**B. Defer `moveParentOptions`** ✓ Implemented 2026-03-18
Deferred `moveParentOptions` to the `editor-suggestions` group (same request as `linkableNotes`). The "Move note" dialog is unavailable until the deferred group resolves — matching the wiki-link suggest behavior.

**C. Cache `notesTree` in middleware** ✓ Implemented 2026-03-18
The sidebar notes tree now caches the fully-built tree array under `notes_tree_{workspace_id}` with a 1-day TTL. The cache is invalidated in `NoteObserver::clearNoteDropdownCache()` alongside the existing dropdown caches — triggered on note create, title/parent/type change, delete, and restore.

**D. Cache `workspaceNoteCounts`** ✓ Implemented 2026-03-18
`workspaceNoteCounts()` now caches the aggregate result under `notes_count_{workspace_id}` with a 1-day TTL, invalidated by the same observer hook as Phase 2C.

#### Phase 3 — Medium priority

**E. Reduce the `$allNotes` query scope** ✓ Implemented 2026-03-18
`renderNotePage` no longer loads all workspace notes on the initial request. Replaced with two targeted queries:
- A recursive CTE (`WITH RECURSIVE note_ancestors`) that walks up from the current note to the root — provides `breadcrumbs` and `noteActions.parent_path` with typically 3–5 rows instead of hundreds.
- A direct `WHERE parent_id = ? AND type = 'meeting'` query for `meetingChildren`.

The deferred `editor-suggestions` group still loads all notes (in its own background request), memoised between the `linkableNotes` and `moveParentOptions` closures.

**F. Fix the uncached today-journal query in `workspaceMeetingParentOptions`**
The cached portion covers the full note list. But a separate `Note::query()->whereDate('journal_date', $today)->first()` runs **outside** the cache on every request. This should be folded into the cache or given its own short-TTL cache key.

```php
// Current: runs every request
$todayJournal = Note::query()->...->where('journal_date', $todayDate)->first();

// Fix: cache for the current day
$todayJournal = Cache::remember(
    "today_journal_{$workspace->id}_{$todayDate}",
    now()->endOfDay(),
    fn () => Note::query()->...->where('journal_date', $todayDate)->first(['id', 'journal_date'])
);
```

**G. Combine duplicate Event queries for meeting notes**
When rendering a meeting note, two separate `Event::query()` calls are made:
1. Fetch the live event to resolve the location (line ~900)
2. Check if the event has been remote-deleted (line ~913)

These can be combined into a single query that fetches the event with its `remote_deleted_at`:

```php
$liveEvent = Event::query()
    ->where(fn ($q) => $q->where('id', $eventBlockId)->orWhere('block_id', $eventBlockId))
    ->first(['id', 'block_id', 'remote_deleted_at', 'eventable_type', 'eventable_id']);

$isEventDeleted = $liveEvent?->remote_deleted_at !== null;
```

**H. Move `workspaceMeetingParentOptions` from shared to page-scoped**
This shared prop is only consumed by the "Attach to Event" dialog on note pages. It runs (and is sent) on every Inertia request across the whole app. It should be scoped to note pages only, either as:
- A deferred page prop on `notes/show`, or
- A lazy API call made only when the dialog opens

#### Phase 4 — Measurement

Track payload sizes and first interaction timings before/after each phase. Key metrics:
- Initial Inertia JSON payload size (bytes) for a `notes/show` load
- TTFB and time-to-interactive on note open
- Number of SQL queries per note page load (use Laravel Debugbar or Telescope)
- Validate no regressions in autosave, note switching, and mobile sidebars.

---

## 2) Current props/data loaded when opening a note

Scope: opening `notes/show` page. Updated to reflect state as of 2026-03-18.

### Shared props (`HandleInertiaRequests::share`) — sent on every Inertia request

| Prop | Query cost | Cached? | Notes |
|---|---|---|---|
| `name` | none | — | Constant |
| `auth.user` | 1 row lookup | no | Fine |
| `workspaces` | workspace + pivot join | no | Lazy (fn) |
| `currentWorkspace` | workspace + membership + COUNT aggregate | no | Lazy (fn); COUNT not cached — **fix in Phase 2D** |
| `notesTree` | full notes scan + PHP sort | no | Lazy (fn); **cache in Phase 2C** |
| `sidebarOpen` | cookie | — | Fine |
| `rightSidebarOpen` | cookie | — | Fine |
| `workspaceLinkableNotes` | full notes scan + path resolution | 1 day ✓ | Lazy (fn) |
| `workspaceMeetingParentOptions` | full notes scan (cached) + today-journal query | partial ✗ | Today-journal runs every request — **fix in Phase 3F** |
| `locale` | user settings | — | Fine |
| `translations.ui` | file read | 12h ✓ | |

> **Note:** `todayEvents` and `todayEventsDate` were in shared props in an earlier version of this document. They have since been removed.

### Page props (`NotesController::renderNotePage`) — note pages only

#### Initial payload

| Prop | Cost | Deferrable? |
|---|---|---|
| `content` | note model column | No — editor content |
| `contentHash` | meta column read | No |
| `noteId` | trivial | No |
| `noteUrl` | string | No |
| `noteUpdateUrl` | string | No |
| `noteHashUrl` | string | No |
| `noteType` | trivial | No |
| `journalGranularity` | trivial | No |
| `journalDate` | trivial | No |
| `journalPeriod` | date math | No |
| `defaultTimeblockDurationMinutes` | user settings | No |
| `editorMode` | workspace setting | No |
| `editorReadOnly` | workspace flag | No |
| `noteActions` | derived from `$allNotes` | No — needed by toolbar on first render |
| `properties` | note column | No |
| `breadcrumbs` | derived from `$allNotes` | No — needed on first render |
| `language` | user settings | No |
| `workspaceSuggestions` | workspace columns | Deferred `editor-suggestions` ✓ |
| `linkableNotes` | `$allNotes` + heading extraction from `meta` | Deferred `editor-suggestions` ✓ |
| `moveParentOptions` | `$allNotes` filter | Deferred `editor-suggestions` ✓ |
| `meetingChildren` | `$allNotes` filter + Event query | **Yes — could be deferred** (shown in right sidebar) |
| `meetingEvent` | 2× Event queries | **Combine into 1 query — Phase 3G** |

#### Deferred (already implemented ✓)

| Prop | Group | Notes |
|---|---|---|
| `relatedTasks` | `related-panel` | Related tasks panel |
| `backlinks` | `related-panel` | Backlinks panel |
| `linkableNotes` | `editor-suggestions` | Wiki-link `[[` suggest menu |
| `moveParentOptions` | `editor-suggestions` | "Move note" dialog |
| `workspaceSuggestions` | `editor-suggestions` | `#` / `@` suggest menus |

---

## 3) The `$allNotes` query — the biggest single bottleneck

`renderNotePage` loads the entire notes table for the workspace on every note page load:

```php
$allNotes = Note::query()
    ->where('workspace_id', ...)
    ->orderBy('created_at')
    ->get(['id', 'workspace_id', 'slug', 'title', 'properties', 'meta',
           'parent_id', 'type', 'journal_granularity', 'journal_date']);
```

This single collection then serves four different purposes:
1. `linkableNotes` — all notes + heading extraction from `meta`
2. `moveParentOptions` — filtered to TYPE_NOTE, excludes self and descendants
3. `breadcrumbs` / `noteActions.parent_path` — ancestor chain traversal
4. `meetingChildren` / `meetingEvent` — filtered to TYPE_MEETING siblings/children

**After deferring `linkableNotes` and `moveParentOptions` (Phase 2A + 2B):**

The query can be dramatically reduced. Breadcrumbs and meeting children only need the ancestor chain and siblings respectively. A targeted approach:

```php
// Option A: two small queries instead of one large one
$ancestors = Note::ancestorsOf($note)->get(['id', 'title', 'parent_id', 'slug', 'type']);
$meetingSiblings = Note::query()
    ->where('parent_id', $note->parent_id ?? $note->id)
    ->where('type', Note::TYPE_MEETING)
    ->get(['id', 'title', 'meta', 'parent_id', 'slug']);
```

This replaces a full-table scan with two small filtered queries.

---

## 4) Query count on a note page load (current)

Approximate SQL queries fired for a `notes/show` page load with warm caches:

| Query | Source | Cached? |
|---|---|---|
| Auth user lookup | Laravel auth | no |
| Workspace + membership | `resolvedWorkspace` | no |
| Workspace membership check | `currentWorkspaceSummary` | no |
| Note count aggregate | `workspaceNoteCounts` | **no** |
| All notes (tree) | `buildNotesTree` | **no** |
| Today journal | `workspaceMeetingParentOptions` | **no** |
| Fetch the note itself | route model binding | no |
| All notes (page) | `renderNotePage.$allNotes` | no |
| Meeting event (live) | `renderNotePage` (meeting only) | no |
| Meeting event (deleted check) | `renderNotePage` (meeting only) | no |
| Deferred: related tasks | `NoteRelatedPanelBuilder` | separate request |
| Deferred: backlinks | `NoteRelatedPanelBuilder` | separate request |

**Highlighted uncached queries that run every request even with warm caches:** note count aggregate, sidebar notes tree, today journal lookup. These are the primary targets for Phase 2C, 2D, and 3F.

---

## 5) Payload size breakdown (estimated)

| Prop | Typical size | Notes |
|---|---|---|
| `content` | 5–100 KB | Varies heavily by note length |
| `linkableNotes` | 10–200 KB | All workspace notes × (id + title + path + headings) |
| `moveParentOptions` | 5–50 KB | Subset of linkableNotes without headings |
| `notesTree` (shared) | 2–20 KB | Nested tree |
| `workspaceLinkableNotes` (shared) | 5–50 KB | Flat list |
| `workspaceMeetingParentOptions` (shared) | 3–30 KB | Flat list |
| `translations.ui` (shared) | 20–60 KB | Full translation file |
| `relatedTasks` (deferred) | 2–20 KB | |
| `backlinks` (deferred) | 1–10 KB | |

`linkableNotes` and `moveParentOptions` are the largest page-specific payloads and the primary targets for deferral.

---

## 6) Background/on-demand fetches (not part of initial payload)

### Automatic after initial page render
- Deferred group request for `related-panel` props (`relatedTasks`, `backlinks`).
- Deferred group request for `editor-suggestions` (`linkableNotes`, `moveParentOptions`, `workspaceSuggestions`).

### User-triggered / interaction-driven
- `PATCH /tasks/checked` from related panel task toggle.
- `router.get(...)` anchor navigation when opening related task/backlink source note.
- `router.reload({ only: ['meetingChildren'] })` after `sarth:note-saved` event.
- `router.reload({ only: ['content', 'relatedTasks', 'backlinks'] })` after task migration.
- Calendar/date navigation in sidebar (`router.get(...)` to target note/date path).
- Command palette navigations (`router.get(...)`).
- Notes tree lazy endpoint on notes-index flows (`/notes/tree`) where applicable.
- After Phase 2B: `GET /notes/{note}/move-options` when "Move" dialog opens.

### Prefetch (cache warmup, not immediate render data)
- Sidebar main nav links.
- Journal nav links.
- Calendar navigation links.
- Breadcrumb links.

Notes:
- Prefetch cache defaults to ~30s in current Inertia React setup unless overridden.
- No continuous polling is used for note page props.

---

## 7) Test coverage

### Translation caching (`DocumentationControllerTest`)
- `shared ui translations are loaded through cache in non-local environments`
- `shared ui translations bypass cache in local environment`

### Session guard + content hash (`SessionGuardTest`)
- `ping endpoint returns 204 for authenticated user`
- `ping endpoint redirects unauthenticated user`
- `saving a note stores a content_hash in meta`
- `content_hash in meta is updated when content changes`
- `hash endpoint returns stored hash for authenticated note owner`
- And more — see `SessionGuardTest.php`

---

## 8) Next option (follow-up)

Apply the same caching pattern to `workspaces` and `currentWorkspace` (static enough to cache for a few minutes), while keeping `notesTree` invalidation tied to the NoteObserver.

Priority order for next implementation steps:
1. ~~**Phase 2C** — Cache `notesTree`~~ ✓ Done
2. ~~**Phase 2D** — Cache `workspaceNoteCounts`~~ ✓ Done
3. ~~**Phase 2A** — Defer `linkableNotes` + `workspaceSuggestions`~~ ✓ Done
4. ~~**Phase 2B** — Defer `moveParentOptions`~~ ✓ Done
5. ~~**Phase 3E** — Reduce `$allNotes` query~~ ✓ Done
6. **Phase 3F** — Fix uncached today-journal query
7. **Phase 3G** — Combine duplicate Event queries for meeting notes
8. **Phase 3H** — Move `workspaceMeetingParentOptions` out of shared props
