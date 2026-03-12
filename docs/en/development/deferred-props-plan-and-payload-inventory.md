# Deferred Props Plan + Payload Inventory (Notes App)

Updated: 2026-03-12

## 1) Proposed approach for deferred/background props

Goal: reduce initial note-open payload and time-to-interactive without breaking editor behavior.

### Principles
- Keep editor-critical data in initial payload.
- Defer non-critical panel data (right after first paint).
- Use explicit skeleton/collapsible placeholders for deferred UI.
- Keep autosave flow stable (no full Inertia page replacement during same-note save).
- Prefer partial reloads for targeted updates.

### Rollout plan
1. Phase 1 (implemented)
- Defer `relatedTasks` and `backlinks` in `notes/show` using Inertia deferred props group `related-panel`.
- Show initial related-panel placeholder skeleton until deferred group loads.
- Update tests to assert deferred data through `loadDeferredProps('related-panel')`.
- Add server-side cache for shared `translations.ui` per locale.
  - Local dev: no cache (instant translation edit feedback).
  - Non-local envs: cached (12h) with deploy-aware invalidation via asset version signature and file-mtime fallback.

2. Phase 2 (candidate)
- Evaluate deferring heavy-but-secondary props such as:
  - `linkableNotes`
  - `workspaceSuggestions`
- Only if editor startup and slash/menu UX remain smooth.

3. Phase 3 (candidate)
- Split shared payload for note pages:
  - Keep small shared globals live.
  - Move larger sidebar-heavy structures to deferred or route-scoped fetching if possible.

4. Phase 4 (measurement)
- Track payload sizes and first interaction timings before/after each phase.
- Validate no regressions in autosave, note switching, and mobile sidebars.

---

## 2) Props/data loaded when opening a note

Scope: opening `notes/show` page.

## Live (initial Inertia payload)

### Shared props (`HandleInertiaRequests::share`)
- `name`
- `auth.user`
- `workspaces`
- `currentWorkspace`
- `notesTree`
- `sidebarOpen`
- `rightSidebarOpen`
- `todayEvents`
- `todayEventsDate`
- `locale`
- `translations.ui`

`translations.ui` is shared and sent in the initial payload, but now resolved through server-side cache in non-local environments.

### Page props (`NotesController::renderNotePage`)
- `content`
- `noteId`
- `noteUrl`
- `noteUpdateUrl`
- `noteType`
- `journalGranularity`
- `journalDate`
- `journalPeriod`
- `defaultTimeblockDurationMinutes`
- `noteActions`
- `properties`
- `linkableNotes`
- `moveParentOptions`
- `breadcrumbs`
- `language`
- `workspaceSuggestions`

## Deferred (loaded just after initial render)
- `relatedTasks` (group: `related-panel`)
- `backlinks` (group: `related-panel`)

UI behavior:
- Related panel renders a placeholder first.
- Actual tasks/backlinks replace it after deferred response resolves.

## Background/on-demand fetches (not part of initial payload)

### Automatic after initial page render
- Deferred group request for `related-panel` props.

### User-triggered / interaction-driven
- `PATCH /tasks/checked` from related panel task toggle.
- `router.get(...)` anchor navigation when opening related task/backlink source note.
- `router.reload({ only: ['content', 'relatedTasks', 'backlinks'] })` after task migration.
- Calendar/date navigation in sidebar (`router.get(...)` to target note/date path).
- Command palette navigations (`router.get(...)`).
- Notes tree lazy endpoint on notes-index flows (`/notes/tree`) where applicable.

### Prefetch (cache warmup, not immediate render data)
- Sidebar main nav links.
- Journal nav links.
- Calendar navigation links.
- Breadcrumb links.

Notes:
- Prefetch cache defaults to ~30s in current Inertia React setup unless overridden.
- No continuous polling is used for note page props.

## Test coverage for translation caching

Added feature tests in `tests/Feature/DocumentationControllerTest.php`:
- `shared ui translations are loaded through cache in non-local environments`
- `shared ui translations bypass cache in local environment`

These tests verify the different runtime behavior without relying on manual local reproduction.

## Next option (follow-up)

Apply the same caching pattern to other shared props that are relatively static (for example `workspaces` and `currentWorkspace`), while keeping dynamic ones (`notesTree`, `todayEvents`) live.
