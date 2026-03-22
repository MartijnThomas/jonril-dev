# Daily Signals And Calendar Indicators

## Goal
Create a structural, extensible system for day-level signals per workspace that powers compact calendar dots now and richer day insights later.

## Scope
The system introduces:
- `workspace_daily_signals`: generic per-day signal storage
- `workspace_daily_indicators`: compact projected read model for calendar UI
- A calculator pipeline with one calculator per signal
- Recalculation hooks triggered by task/note updates

## Signal Catalog

### `meeting_load`
States:
- `free_day`
- `has_meetings`
- `conflict_detected`

Value payload example:
- `meeting_count`
- `has_conflict`

### `timeblock_health`
States:
- `no_plan`
- `planned_focus_blocks`
- `overdue_unsynced`

Value payload example:
- `timeblock_count`
- `unsynced_count`

### `task_risk`
States:
- `all_clear`
- `due_open`
- `overdue_open`

Value payload example:
- `open_count`
- `overdue_open_count`

### `capture_activity`
States:
- `no_note`
- `note_empty`
- `has_content`
- `high_activity`

Value payload example:
- `note_exists`
- `word_count`
- `tasks_total`

### `migration_state`
States:
- `no_migration`
- `has_migrated`
- `unresolved_links`

Value payload example:
- `migrated_count`
- `unresolved_count`

### `calendar_sync_health`
States:
- `no_active_calendars`
- `ok`
- `stale`
- `failed`

Value payload example:
- `active_count`
- `stale_count`
- `failed_count`

### `birthday_or_special`
States:
- `none`
- `has_birthdays`

Value payload example:
- `birthday_count`

### `completion_trend`
States:
- `no_tasks`
- `no_progress`
- `partial_progress`
- `all_completed`

Value payload example:
- `open_count`
- `completed_count`
- `completion_ratio`

## Data Model

### `workspace_daily_signals`
Columns:
- `id` (uuid)
- `workspace_id` (fk)
- `date`
- `signal_key`
- `state`
- `value_json` (json, nullable)
- timestamps

Constraints:
- unique: (`workspace_id`, `date`, `signal_key`)

### `workspace_daily_indicators`
Columns:
- `id` (uuid)
- `workspace_id` (fk)
- `date`
- `structure_state` (nullable)
- `calendar_state` (nullable)
- `work_state` (nullable)
- `has_note` (bool)
- `has_events` (bool)
- `tasks_open_count` (int)
- `tasks_completed_count` (int)
- timestamps

Constraints:
- unique: (`workspace_id`, `date`)

## Pipeline

Contract:
- `DailySignalCalculator`
- `key(): string`
- `calculate(Workspace $workspace, CarbonInterface $date): DailySignalResult`

Execution:
1. Run all calculators for `(workspace, date)`
2. Upsert each signal row
3. Delete stale signal keys for that date
4. Project signals to indicator row

Core classes:
- `DailySignalPipeline`
- `IndicatorProjectionService`
- `RecalculateDailySignalsJob`

## Triggering And Hooks

### Current hooks
- `NoteTaskObserver`
  - on create/update/delete/restore/force-delete
  - computes affected date set from `journal_date`, `due_date`, `deadline_date` (new + old where relevant)
  - dispatches `RecalculateDailySignalsJob`
- `ReindexNoteJob`
  - captures old/new task dates around reindex
  - dispatches recalculation for touched dates

### Why observer + job (not indexer)
- Keeps indexer focused on indexing
- Keeps side effects thin and async
- Supports idempotent recalculation

## Dot Strategy (3 channels)

Current compact dot channels:
- `structure` channel: note/content presence
- `calendar` channel: events/timeblocks/sync health
- `work` channel: task risk/completion

Rendering can stay compact while tooltips/popovers can expose full signal states and counts from `workspace_daily_signals`.

## Projection Mapping (Current)

- `has_note` from `capture_activity` (`no_note` vs other states)
- `has_events` from meeting/timeblock/birthday signal payload counts
- `work_state`:
  - `red` if `task_risk=overdue_open`
  - `orange` if `task_risk=due_open`
  - `green` if no open tasks and completed tasks > 0

## Caching Strategy
- Cache indicator reads per workspace + month/range
- Invalidate by affected dates after recalculation
- Keep short TTL as safety net

## Next Steps
1. Read indicators directly in sidebar endpoint before fallback aggregation
2. Add event observer hook to recalc when events/calendar items change
3. Add month cache-key invalidation by affected dates
4. Add tooltip/popover using raw signal rows
5. Add automated backfill command for historical ranges
