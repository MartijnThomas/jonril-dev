# Timeblock -> Calendar Outbound Sync Plan

## Goal

Allow a user to select one connected calendar in their **personal workspace** as the outbound target for timeblocks created in daily journal notes.

Initial synced fields (phase 1):

- title
- location
- starts_at / ends_at

Behavior:

- create timeblock -> create remote calendar event
- update synced fields -> update remote calendar event
- remove timeblock -> delete remote calendar event

## Scope (v1)

- Block editor only.
- Daily journal timeblocks only (same scope as current indexer).
- Personal workspace only.
- One selected outbound calendar per user.
- One-way source of truth: app timeblocks -> remote calendar.

Out of scope (later):

- Two-way edits from remote back into notes.
- Recurrence support.
- Per-timeblock calendar selection.
- Syncing non-timeblock note events.

## Current constraints to address first

Current `TimeblockIndexer` flow deletes and recreates all timeblocks/events for a note on reindex. That is not compatible with stable outbound sync because remote mappings would churn on each save.

Before outbound sync, we need stable local identity per timeblock block.

## Duplicate prevention (must-have)

When outbound sync and inbound calendar sync are both active, duplicates can happen unless we enforce strict idempotency. Implementation must include all guards below.

### 1) Stable local IDs (no recreate-on-save)

- Do not `DELETE + INSERT` all timeblocks/events on each reindex.
- Upsert by `(note_id, block_id)` so a timeblock keeps the same `event_id`.

### 2) Database uniqueness

- Keep/enforce uniqueness for local timeblock events by note/block.
- Add unique mapping per outbound target:
  - `timeblock_calendar_links(event_id, calendar_id)` unique.

### 3) Deterministic remote UID

- Outbound writes use deterministic UID: `jonril-timeblock-{event_id}`.
- Create path is idempotent:
  - if remote UID already exists, treat as link/update, not as a second create.

### 4) Inbound/outbound loop guard

- Outbound-created remote events are tagged (UID prefix + source marker).
- Inbound CalDAV sync must not create a separate `CalendarItem`+`Event` for these.
- Instead, reconcile to existing outbound mapping.

### 5) Concurrency guard

- Acquire a per-item lock in outbound jobs (keyed by `calendar_id + event_id`) to prevent parallel duplicate writes.

## Data model changes

### 1) User outbound calendar preference

Store selected outbound calendar in user settings:

- `user.settings.calendar.outbound_timeblock_calendar_id` (nullable UUID)

Rules:

- Must reference an active calendar in the user's personal workspace.
- If calendar is removed/deactivated, preference is cleared.

### 2) Outbound mapping table

Add `timeblock_calendar_links` table (new, do not overload inbound `calendar_items`):

- `id` UUID
- `workspace_id` UUID
- `note_id` UUID
- `event_id` UUID (local `events.id`, where `eventable_type = Timeblock`)
- `timeblock_id` UUID
- `calendar_id` UUID (target connected calendar)
- `remote_uid` string
- `remote_href` string nullable
- `remote_etag` string nullable
- `sync_status` enum (`pending_create`, `synced`, `pending_update`, `pending_delete`, `failed`)
- `last_synced_at` nullable datetime
- `last_error` nullable text
- timestamps

Indexes:

- unique `(event_id, calendar_id)` to prevent duplicates
- index `(calendar_id, sync_status)`
- index `(workspace_id, note_id)`

## Backend architecture

### A) Stable timeblock indexing

Refactor `TimeblockIndexer` from destructive replace to deterministic upsert:

- key by `(note_id, block_id)` for daily journal nodes
- upsert local `timeblocks` + `events` when block persists
- create when new block appears
- delete only when block removed

This keeps `event_id` stable across normal edits and prevents unnecessary remote create/delete churn.

### B) Outbound sync orchestrator

Add service `TimeblockCalendarSyncService`:

- `queueCreate(Event $event, Calendar $calendar)`
- `queueUpdate(Event $event, Calendar $calendar)`
- `queueDelete(Event $event, Calendar $calendar)`
- `syncPending(Calendar $calendar)` (batch worker entry)

Trigger points:

- after `TimeblockIndexer` persist, detect created/updated/deleted timeblock events
- resolve current user's outbound calendar preference
- enqueue sync intents by writing/updating `timeblock_calendar_links`

### C) Queue jobs

Add jobs:

- `SyncTimeblockCreateJob`
- `SyncTimeblockUpdateJob`
- `SyncTimeblockDeleteJob`

Jobs call CalDAV write methods and update link state/etag/error.

### D) CalDAV write support

Extend `CalDavService` with outbound methods:

- `createTimeblockEvent(Calendar $calendar, Event $event, Timeblock $timeblock): RemoteWriteResult`
- `updateTimeblockEvent(Calendar $calendar, TimeblockCalendarLink $link, Event $event, Timeblock $timeblock): RemoteWriteResult`
- `deleteTimeblockEvent(Calendar $calendar, TimeblockCalendarLink $link): RemoteWriteResult`

Use:

- UID namespace prefix (example: `jonril-timeblock-{event_id}`)
- optimistic update with ETag where available

## Frontend changes

### 1) Settings UI (personal workspace)

In workspace calendar settings (personal workspace only):

- add section: "Timeblock sync target"
- dropdown of active connected calendars
- option: "None"
- save selection to user settings

### 2) Optional status hints (v1.1)

Not required for first merge, but planned:

- show lightweight sync state on timeblocks (`synced`, `failed`)
- retry action for failed sync

## Sync lifecycle details

### Create

1. user creates timeblock line
2. local event/timeblock created via indexer
3. mapping row created with `pending_create`
4. create job runs -> remote event created
5. mapping becomes `synced` with uid/href/etag

### Update (title/location/time)

1. user edits timeblock
2. local event/timeblock updated (same `event_id`)
3. mapping set to `pending_update`
4. update job runs -> remote event updated
5. mapping returns to `synced`

### Delete

1. timeblock block removed from note
2. local event/timeblock deleted or marked deleted in reindex delta
3. mapping set to `pending_delete`
4. delete job runs -> remote event deleted
5. mapping row removed (or kept as tombstone for short retention; decide in implementation)

## Failure handling

- Remote write failure never blocks note save.
- Store error in mapping, set `failed`.
- Add scheduled retry command:
  - `timeblocks:sync-outbound --workspace=<id?> --calendar=<id?>`
- Exponential backoff on job retries.
- If calendar credentials fail repeatedly, disable outbound sync and surface warning in settings.

## Security and authorization

- Outbound sync allowed only for:
  - authenticated user
  - personal workspace calendars
  - selected calendar the user can manage
- Re-check authorization in jobs (calendar still belongs to personal workspace, membership still valid).

## Testing plan

### Feature tests

- user can set outbound calendar target in personal workspace
- cannot set outbound target for non-personal workspace
- create timeblock enqueues outbound create intent
- update title/location enqueues outbound update intent
- delete timeblock enqueues outbound delete intent

### Unit tests

- deterministic diff logic for created/updated/deleted timeblocks
- mapping state transitions

### Integration tests (service level)

- CalDAV create/update/delete payload correctness
- ETag conflict handling

## Rollout phases

### Phase 1: Foundations

- add preference storage
- add mapping table
- add stable upsert-based timeblock indexing

### Phase 2: Outbound write path

- add sync service + jobs
- add CalDAV outbound methods
- hook create/update/delete intents

### Phase 3: UX and ops hardening

- settings UI selector
- retry command + monitoring
- optional sync-status indicators

## Acceptance criteria

- User can choose one connected calendar in personal workspace as timeblock sync target.
- Creating a daily journal timeblock creates one remote calendar event.
- Editing synced fields updates the same remote event (no duplicates).
- Removing the timeblock removes the remote event.
- Failures are non-blocking for note save and are retryable.
- Non-personal workspaces cannot configure or run outbound timeblock sync.

## Implementation progress

### March 21, 2026

- Completed:
  - Duplicate-prevention strategy documented explicitly (stable IDs, uniqueness, deterministic UID, loop guard, locking).
  - Timeblock indexing refactored away from full delete+recreate toward deterministic block-based upsert.
  - Reindex now emits create/update/delete event deltas for timeblocks.
  - New `timeblock_calendar_links` migration and model added.
  - New `TimeblockCalendarSyncService` added to queue local sync intents (`pending_create`, `pending_update`, `pending_delete`) using user-selected outbound calendar.
  - `ReindexNoteJob` now forwards timeblock deltas to sync intent service.
  - Outbound CalDAV write primitives added:
    - `CalDavService::createTimeblockEvent(...)`
    - `CalDavService::updateTimeblockEvent(...)`
    - `CalDavService::deleteTimeblockEvent(...)`
  - Outbound jobs added on `calendar-sync` queue:
    - `SyncTimeblockCreateJob`
    - `SyncTimeblockUpdateJob`
    - `SyncTimeblockDeleteJob`
    - include per-item cache locks to reduce concurrent duplicate writes
  - Retry/dispatch command added:
    - `php artisan timeblocks:sync-outbound [--workspace=] [--calendar=] [--limit=]`
    - scheduled every minute in `routes/console.php`
  - Personal workspace settings now include a "Timeblock sync target" selector (active connected calendar or None).
  - New endpoint to save/clear user outbound target:
    - `PATCH /settings/workspaces/{workspace}/timeblock-sync-target`
  - Outbound target preference is automatically cleared when the selected calendar is deactivated or disconnected.
  - Dispatch policy implemented via config:
    - `TIMEBLOCKS_OUTBOUND_DISPATCH=immediate|scheduled`
    - immediate mode now dispatches create/update/delete jobs directly after reindex intent writes
    - scheduled mode keeps command/scheduler-based dispatch only
  - Personal workspace calendars settings now show outbound sync stats for the selected target:
    - total / synced / pending / failed
  - Retry failed flow implemented:
    - `POST /settings/workspaces/{workspace}/timeblock-sync-retry-failed`
    - failed links are reset to a deterministic pending status and dispatched immediately
  - Service-level outbound CalDAV tests added:
    - create payload/href/etag extraction
    - update payload + If-Match behavior
    - delete behavior for missing href and 404 responses
  - In-editor block mode indicator added for outbound sync issues:
    - pending and failed statuses rendered on affected daily timeblock lines
    - status source is per-block mapping from selected outbound calendar link state
  - Feature coverage added for:
    - stable event/timeblock IDs on edit
    - no duplicate event rows on repeated saves
    - create/update/delete intent status transitions in `timeblock_calendar_links`
    - outbound command dispatching correct jobs per pending status/filter
    - outbound target endpoint constraints (personal-only + active calendar validation)
    - calendar deactivation/disconnect clearing stale outbound target preference
    - immediate vs scheduled dispatch behavior
    - outbound sync stats payload for workspace settings
    - retry-failed endpoint dispatching jobs for failed links
    - outbound CalDAV request payload and header behavior
    - note show payload includes per-block timeblock sync status mapping
  - Calendar connection model implemented:
    - added `calendar_connections` as provider/account parent table
    - calendars now belong to connection via `calendars.calendar_connection_id`
    - connection-level actions (sync, password update, disconnect) now operate on connection records
  - Legacy calendar credential fields removed from `calendars`:
    - dropped `connection_id`, `provider`, `username`, `password` from calendar rows
    - credentials now live on `calendar_connections` only
  - Added normalization command for existing environments:
    - `php artisan calendars:normalize-connections [--workspace=<id>]`
    - idempotently groups workspace calendars under one canonical connection and removes unused connection rows
  - Reconnect-safe relinking implemented:
    - selecting outbound target now backfills missing `timeblock_calendar_links` for existing timeblock events
    - relink uses deterministic `remote_uid`/`remote_href` and queues `pending_update` to bind back to existing remote items where possible
  - Activation behavior changed:
    - newly connected/discovered calendars are created inactive by default
    - user must explicitly activate calendars
  - Local cleanup performed during implementation:
    - duplicate orphan synced `events` rows were removed from local dev database only

- Next:
  - Run production migration + normalization rollout:
    - `php artisan migrate --force`
    - `php artisan calendars:normalize-connections`
  - Verify personal workspace calendar settings UI after deploy:
    - connection grouping renders correctly
    - default inactive calendars require explicit activation
  - Monitor outbound sync after reconnect scenarios in production and confirm no duplicate timeblock events.
