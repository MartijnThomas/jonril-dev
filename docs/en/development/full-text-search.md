---
title: Full-Text Search — Current Architecture & Next Steps
section: Development
---

# Full-Text Search — Current Architecture & Next Steps

## Current status (2026-03-18)

- Laravel Scout + Meilisearch is active for `NoteTask` search.
- Tasks page currently uses a **hybrid query flow**:
  - If `q` is empty: MySQL/Eloquent only.
  - If `q` is present: Scout/Meilisearch finds matching task IDs first, then MySQL/Eloquent builds the final paginated task list.
- Frontend task filters currently in use:
  - `workspace_ids`
  - `note_scope_ids`
  - `status`
  - `date_preset` or `date_from` + `date_to`
  - `group_by`
  - `q`

---

## Why hybrid (current approach)?

- MySQL is still the source of truth for final task payload mapping, eager loading, ordering, and pagination.
- Meilisearch is used where it adds most value now: text search + fast filter narrowing when `q` is present.
- This keeps non-search list views resilient if search infrastructure is unavailable.

---

## NoteTask index (Meilisearch)

### Indexed payload (`NoteTask::toSearchableArray()`)

Fields currently indexed:

- `note_title`
- `parent_note_title`
- `content_text`
- `hashtags`
- `mentions`
- `workspace_id`
- `note_id`
- `parent_note_id`
- `checked`
- `task_status`
- `search_status` (normalized)
- `due_date`
- `deadline_date`
- `journal_date`

### Filterable attributes (`config/scout.php`)

- `workspace_id`
- `note_id`
- `parent_note_id`
- `hashtags`
- `checked`
- `task_status`
- `search_status`
- `due_date`
- `deadline_date`
- `journal_date`

### Sortable attributes

- `due_date`
- `deadline_date`
- `journal_date`

---

## Status semantics (normalized)

`search_status` is used to keep search filtering behavior stable:

- `open` = unchecked and no explicit status
- `completed` = checked
- `canceled`, `migrated`, `assigned`, `in_progress`, `starred` = explicit statuses
- `backlog` includes both `backlog` and legacy `question`

---

## Date filter behavior

Date filtering on tasks page currently matches a task when:

- `due_date` is within range, OR
- `deadline_date` is within range, OR
- both `due_date` and `deadline_date` are null, and `journal_date` is within range.

---

## Production setup (Forge + deploy)

```bash
php artisan scout:sync-index-settings
php artisan scout:import "App\Models\NoteTask"   # one-time backfill / rebuild
```

And ensure:

```ini
SCOUT_DRIVER=meilisearch
SCOUT_QUEUE=true
MEILISEARCH_HOST=http://127.0.0.1:7700
MEILISEARCH_KEY=YOUR_STRONG_KEY
```

If `SCOUT_QUEUE=true` in production, indexing happens through queues. You must keep queue workers running (Horizon or Supervisor queue workers), otherwise search will not update after note/task changes.

---

## Next steps (recommended)

### 1. Keep hybrid as default for now
- Current model is stable and already tested.
- It balances search quality with SQL-backed safety for final payload generation.

### 2. Optional: add “Meilisearch-first for all filters” behind a feature flag
- Use Meilisearch for filter-only screens too (no `q`) by issuing an empty query with filter expressions.
- Keep SQL fallback path enabled.
- Validate parity on:
  - status buckets
  - date-range behavior
  - pagination and ordering consistency

### 3. Add relevance tuning for task search
- Tune ranking/searchable attributes (title/path stronger than content if desired).
- Add acceptance tests for expected ranking order on common queries.

### 4. Start Note index design as separate track
- Introduce `Note` searchable payload (title + extracted text + tags/mentions/hashtags).
- Keep task search and note search concerns separated to avoid coupling rollout risk.

---

## Note indexing plan (implementation-ready)

### Goal
- Add full-text search for notes themselves (title + body + metadata) using Scout/Meilisearch, without regressing note page performance or editor save flow.

### Phase A: Define note search document shape
- Add `Searchable` to `App\Models\Note`.
- Implement `Note::toSearchableArray()` with at least:
  - `title`
  - `content_text` (extracted plain text from JSON block content)
  - `workspace_id`
  - `type`
  - `journal_granularity`
  - `journal_date`
  - `tags` (from properties)
  - `mentions`
  - `hashtags`
  - `parent_id`
- Add `searchableAs()` for a dedicated index (for example `notes`).

### Phase B: Implement deterministic content extraction
- Create a dedicated extractor service (for example `NoteSearchTextExtractor`) that:
  - walks the current note JSON structure
  - extracts visible text from headings/paragraphs/list items/task items
  - ignores non-searchable noise (IDs, attrs-only nodes, formatting marks)
- Keep extraction deterministic and side-effect free so reindexing is stable.

### Phase C: Configure Meilisearch index settings
- Add `notes` settings in `config/scout.php`:
  - `searchableAttributes`: `title`, `content_text`, `tags`, `hashtags`, `mentions`
  - `filterableAttributes`: `workspace_id`, `type`, `journal_granularity`, `journal_date`, `parent_id`
  - `sortableAttributes`: `updated_at`, `journal_date`, `title`
- Run `php artisan scout:sync-index-settings`.

### Phase D: Wire sync lifecycle
- Ensure note create/update/delete events trigger Scout sync via model `Searchable`.
- Keep queue-based indexing (`SCOUT_QUEUE=true`) in non-local environments.
- For bulk consistency, keep `ReindexNoteJob` as authoritative when note structure changes significantly.

### Phase E: Add note search endpoint + controller strategy
- Add a dedicated notes search controller (parallel to `TaskSearchController`).
- Suggested runtime approach:
  - with `q`: Meilisearch for candidate IDs + filters, MySQL for final payload mapping/pagination
  - without `q`: existing MySQL listing path
- Reuse current workspace authorization and route scoping rules.

### Phase F: UI integration
- Add a note search input in the relevant page(s) with debounced query behavior.
- Keep current filters in URL so search is shareable and back/forward-safe.
- Preserve keyboard navigation and existing empty/loading states.

### Phase G: rollout and verification
- One-time backfill:
  - `php artisan scout:import "App\Models\Note"`
- Add tests:
  - payload test for `Note::toSearchableArray()`
  - controller feature tests for `q + workspace/type/date` combinations
  - regression test that note updates are reflected in search results
- Validate on production-like data before enabling to all users.

### Optional after rollout
- Add ranking tuning (title > content) using Meilisearch ranking/searchable settings.
- Add typo tolerance tuning if precision/recall needs adjustment.
- Consider a combined command palette source (notes + headings + tasks) once note index quality is stable.

---

## Operational notes

- `127.0.0.1:7700` should remain private to app host.
- Data directory persists on disk; re-run `scout:import` after reprovision.
- Typical Meilisearch memory footprint remains moderate (~150–300 MB idle).
