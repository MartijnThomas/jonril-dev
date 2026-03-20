# Journal Notes & Personal Workspace Plan

## Status Snapshot (March 20, 2026)

- `Step 1` through `Step 6` are implemented and covered by feature/browser tests.
- Journal routing and journal context behavior are stable on canonical `/journal/{period}` routes.
- Personal workspace lifecycle guardrails are in place (non-deletable, non-transferable, clear supported).
- Calendar settings/actions are now personal-workspace-only.
- The remaining relevant work is in **Improvement Path 2** (cross-workspace linking/backlinks behavior) and in open product decisions listed below.

## Current State

- Every note (including journal notes) belongs to a workspace via `workspace_id`.
- Journal notes are unique per `(workspace_id, journal_granularity, journal_date)`.
- Journal routes currently exist in both forms:
  - canonical non-scoped: `/journal/{period}`
  - compatibility redirects: `/journal/{granularity}/{period}` and `/w/{workspace}/journal/...`
- Journal entry points (`/journal`, `/notes`) resolve against personal workspace.
- Switching workspaces still updates `user.settings['workspace_id']`.
- Users can have multiple workspaces. The personal workspace is auto-created on registration.

---

## Target Workspace Model (Revised)

### Goal

Keep **multiple workspaces** for collaboration, while enforcing that journals are a **personal-workspace-only** capability.

### Rules

- Each user has exactly one **personal workspace** (`is_personal = true`).
- Users can create additional **collaboration workspaces** (`is_personal = false`).
- Journal notes (`TYPE_JOURNAL`) are only allowed in the personal workspace.
- Personal workspace:
  - cannot be deleted
  - ownership cannot be transferred
  - can be "erased" (clear notes/content) but not removed
- Non-personal workspaces:
  - can be deleted by owner
  - ownership transfer remains allowed
  - do not support journal notes

### What Changes

**Backend**

- Enforce `is_personal` as first-class workspace metadata.
- Keep `WorkspaceController@store` enabled (users can still create additional workspaces).
- Add authorization/business rules:
  - block delete for `is_personal = true`
  - block ownership transfer for `is_personal = true`
  - block journal note creation/access outside personal workspace
- Keep personal workspace auto-creation during registration.

**Frontend**

- Keep workspace switcher (multi-workspace remains).
- Journal entry points should always resolve to the personal workspace journal routes.
- In workspace settings UI:
  - show "Erase workspace" (or equivalent) for personal workspace
  - hide/disable delete + transfer-owner for personal workspace
  - keep delete + transfer-owner for non-personal workspaces

### What Stays the Same

- Notes still belong to workspaces.
- Users can collaborate in shared workspaces.
- Journal notes remain stored as `TYPE_JOURNAL` notes, but only in personal workspace.

---

## Improvement Path 1: Journal Notes Feel Workspace-Agnostic

### Goal

Journal notes should feel like a **personal, global feature** — not tied to a workspace. Navigating to a journal note never triggers a workspace context switch in the UI.

### Problem Today

When a user opens a journal note from the sidebar, the `HandleInertiaRequests` middleware resolves the current workspace from the route's `{workspace}` slug. If the journal note's workspace differs from the currently active workspace, it effectively performs a context switch — the notes tree, workspace color, and workspace name all change.

### Proposed Changes

**Backend**

- Introduce a workspace-agnostic journal route prefix: `/journal/{granularity}/{period}` (no `/w/{slug}` prefix).
- The controller resolves the journal note always from the user's **personal workspace** (`is_personal = true`), regardless of the active workspace stored in `user.settings`.
- `HandleInertiaRequests` detects that the current route is a journal route and does **not** update the active workspace context — the `currentWorkspace` shared prop continues to reflect the user's previously active workspace.
- The journal URL can remain `/journal/daily/2026-03-18` — clean, short, and not workspace-prefixed.

**Frontend**

- The journal sidebar section is rendered outside of workspace-specific navigation.
- Opening a journal note does not change the active workspace highlight in the sidebar.
- The notes tree in the sidebar continues to show the last active workspace's notes when browsing the journal.
- Wiki-links inside journal notes resolve against the personal workspace only (same as today).

### Data Model

No schema changes required. Journal notes remain on the personal workspace. The only change is route resolution logic.

---

## Improvement Path 2: Cross-Workspace Journal Notes with Linking

### Goal

Journal notes (always in the personal workspace) can **link to notes in any workspace** the user has access to. Multiple users can independently link their own meeting notes (in their personal workspaces) to the same shared note.

### Use Case Example

- A team shares a **workspace** with a note: "Q2 Roadmap Discussion".
- User A writes a daily journal note in their personal workspace and inserts a wiki-link to "Q2 Roadmap Discussion".
- User B does the same — their own journal note, their own personal workspace, linking to the same shared note.
- Opening "Q2 Roadmap Discussion" in the shared workspace shows backlinks from both users' meeting/journal notes.

### Proposed Changes

#### 2a: Cross-Workspace Wiki-Link Resolution

**Current behaviour:** Wiki-links (`[[Note Title]]`) resolve only within the current workspace (scoped by `workspace_id` in slug/title lookup).

**New behaviour:**

- When resolving a wiki-link inside a journal note, search across all workspaces the user is a member of.
- Return the first match, prioritising the personal workspace, then other workspaces by membership order.
- Store resolved links in the existing `note_links` (or equivalent) table with both `source_workspace_id` and `target_workspace_id` columns so cross-workspace relationships are explicit.
- If the target note is in a different workspace, the link renders with a visual indicator (e.g., workspace icon/color badge).

**Schema addition:**

```sql
ALTER TABLE note_links
  ADD COLUMN source_workspace_id UUID REFERENCES workspaces(id),
  ADD COLUMN target_workspace_id UUID REFERENCES workspaces(id);
```

#### 2b: Cross-Workspace Backlinks

**Current behaviour:** Backlinks are scoped to the current workspace.

**New behaviour:**

- When viewing a note in any workspace, backlinks include references from journal/meeting notes in other workspaces — but **only from the viewing user's own notes**.
- Backlinks from other users' personal workspaces are not visible (privacy boundary).
- A future opt-in "shared backlinks" feature could allow users to expose their journal/meeting backlinks to workspace members.

#### 2c: Meeting Notes Linked to Shared Notes

- Meeting notes (`TYPE_MEETING`) in a personal workspace can reference a note in a shared workspace as their "subject".
- The shared note gains a `meeting_notes` backlink panel showing all meeting notes linked to it by the current user.
- Multiple users each see their own meeting notes in this panel.
- Schema: add `linked_note_id` (nullable, cross-workspace) on the `notes` table for meeting notes, with no workspace constraint on the foreign key check (validated in application code instead).

#### 2d: Workspace Context When Following Cross-Workspace Links

- Clicking a cross-workspace wiki-link from a journal note navigates to the target note **and switches the active workspace** to the target's workspace.
- Navigating back (browser back or breadcrumb) returns to the journal note without losing the journal context.
- This is the one intentional workspace switch that originates from a journal note — it is explicit (user clicked a link to a different workspace's note).

### Boundaries & Privacy

| Scenario | Visible to user |
|---|---|
| Own journal note links to shared workspace note | Yes |
| Other user's journal note links to shared workspace note | No (unless opt-in sharing) |
| Backlinks in personal workspace from shared notes | Yes |
| Meeting notes from other users on a shared note | No (each user sees own only) |

### Migration Path

1. Add `is_personal` flag to workspaces, backfill (first workspace per user = personal).
2. Add guardrails: prevent personal-workspace delete and ownership transfer.
3. Restrict journal routes/services to personal workspace only.
4. Add `source_workspace_id` / `target_workspace_id` to link tables.
5. Update wiki-link resolver to search across workspaces for journal/meeting note contexts.
6. Update backlink queries to include cross-workspace sources filtered by current user.
7. Add `linked_note_id` to notes for meeting note subjects.

---

## Recommended Rollout Order

To reduce risk, implement this in small, reversible slices:

1. **Personal-workspace guardrails first**  
   Enforce non-deletable/non-transferable personal workspace and journal-only-on-personal rules.
2. **Path 1 second (workspace-agnostic journal routing)**  
   Keep journal behaviour personal while removing implicit context switches.
3. **Cross-workspace linking third (Path 2a + 2b)**  
   Add link/backlink cross-workspace awareness after journal context is stable.
4. **Meeting-note subject linking last (Path 2c + 2d)**  
   Depends on cross-workspace primitives and explicit workspace-switch UX.

This order gives visible UX improvement quickly without schema-heavy changes first.

---

## First Steps (Implementation Sprint 1)

### Step 1: Enforce personal workspace lifecycle rules

- Add authorization/service checks:
  - reject personal workspace delete
  - reject personal workspace owner transfer
  - allow erase action for personal workspace
- Add feature tests for each rule.

Status (2026-03-20):
- Implemented:
  - `workspaces.is_personal` added + backfill (one personal workspace per owner).
  - Personal workspace auto-created for new users.
  - Newly created extra workspaces default to non-personal.
  - Guardrails: personal workspace delete blocked, ownership transfer blocked.
  - Personal workspace invariant hardened in model lifecycle:
    - promoting any workspace to personal automatically demotes other personal workspaces for that owner
    - demoting the only personal workspace for an owner is blocked
    - feature tests added for both behaviors
  - Feature tests for delete/transfer guardrails.
  - Console command added to reassign personal workspace for existing users:
    - `php artisan workspaces:set-personal --user=<id|email> --workspace=<id|slug> [--force]`
    - Command removes `is_personal` from the previous personal workspace and sets it on the selected workspace.
  - Workspace settings UI updated:
    - personal workspace: delete section replaced by clear-workspace flow with confirmation dialog
    - non-personal workspace: existing delete flow unchanged
  - Personal workspace clear action implemented:
    - route: `POST /settings/workspaces/{workspace}/clear`
    - owner-only + personal-workspace-only guardrails
    - clears all notes (including soft-deleted) and journal notes via hard delete
    - also clears workspace content related to notes: events, timeblocks, calendar items and synced ranges
    - supports user option `include_calendars` to also remove calendar connections
    - related workspace data cleared consistently via `ClearWorkspaceContent`
  - Calendars restricted to personal workspaces only:
    - backend guards added to calendar connect/update/disconnect/sync/refresh actions
    - workspace settings sidebar and section rendering hide calendars for non-personal workspaces
    - feature tests added for non-personal workspace calendar guardrails
  - Feature tests added for clear action success and guardrails.
- Pending:
  - Decide whether non-personal workspaces should also support clear/erase in future.

### Step 2: Add personal workspace resolver and tests

Create a single source of truth for "personal workspace for current user".

- Add a helper/service (for example `App\Support\Workspaces\PersonalWorkspaceResolver`).
- Behaviour:
  - returns `currentWorkspace()` fallback if no `is_personal` yet
  - once `is_personal` exists, returns `is_personal = true` workspace
- Add tests for:
  - user with one workspace
  - user with multiple workspaces + one personal workspace
  - fallback behaviour when personal flag is missing

Status (2026-03-20):
- Implemented:
  - Added `App\Support\Workspaces\PersonalWorkspaceResolver`.
  - Resolver returns the user's `is_personal = true` workspace when present.
  - Resolver falls back to `currentWorkspace()` when no personal flag exists yet.
  - Added feature tests for all three resolver scenarios.
  - Updated `journal.landing` and `notes.landing` to resolve target workspace via the resolver.

### Step 3: Restrict journals to personal workspace

- In journal creation/show flows, resolve via personal workspace resolver.
- For non-personal workspace journal paths, redirect to personal journal route (or 404, pick one and keep consistent).
- Add tests proving no journal note can be created in non-personal workspaces.

Status (2026-03-20):
- Implemented:
  - Journal show flows now resolve against personal workspace.
  - Scoped journal URLs (`/w/{workspace}/journal/...`) redirect to the personal workspace URL when `{workspace}` is non-personal.
  - Feature tests added for both scoped journal route variants.
  - Task migrate flows now create/use journal targets in the personal workspace (never in non-personal source workspaces).
  - Feature tests added to verify no journal is created in non-personal workspace during task-to-journal migration.
  - Command/import policy decision applied:
    - `JournalNoteService` now blocks creating new journals in non-personal workspaces by default.
    - Legacy import keeps an explicit migration-only exception (`allowNonPersonalWorkspace = true`) for historical imports.
- Pending:
  - None for app-facing journal creation flows in this phase.

### Step 4: Introduce workspace-agnostic journal routes

Add route aliases without `/w/{workspace}`:

- `/journal/{granularity}/{period}`
- `/journal/{period}`

Controller behaviour:

- resolve journal note via personal workspace resolver
- do **not** mutate active workspace in user settings

Keep existing `/w/{workspace}/journal/...` routes for backward compatibility during transition.

Status (2026-03-20):
- Implemented:
  - Canonical journal route is now `/journal/{period}` (`journal.show.by-period`).
  - `/journal/{granularity}/{period}` redirects to the canonical period route.
  - Workspace-scoped journal routes are kept for backward compatibility and redirect to canonical non-scoped routes.
  - Journal URL generation now uses canonical non-scoped URLs in slug/search helpers and task migrate targets.
- Pending:
  - None.

### Step 5: Prevent workspace context switch on journal pages

In `HandleInertiaRequests`:

- detect journal routes (`journal.*`)
- keep `currentWorkspace` based on last active workspace, not journal note workspace
- ensure right sidebar events on journal pages are always resolved from the personal workspace

Status (2026-03-20):
- Implemented:
  - Middleware now keeps `currentWorkspace` as the user's active workspace on `journal.*` routes.
  - Shared props now include `personalWorkspace` summary for journal-context consumers.
  - Right sidebar calendar now fetches events/sync from personal workspace while on journal pages.
  - Added backend feature tests for sidebar events behavior in journal context and membership guardrails.
- Pending:
  - None.

Acceptance criteria:

- Opening a journal note never changes sidebar workspace context.
- Returning from a shared-workspace note back to journal keeps expected context.
- Right sidebar event list on journal pages always reflects personal workspace events.

### Step 6: Frontend journal entry point + switcher behaviour

- Update sidebar journal links to use workspace-agnostic `/journal/...` routes.
- Keep notes tree and workspace switcher state unchanged while inside journal routes.
- Add browser tests for:
  - open journal from workspace A, context stays A
  - navigate to workspace B note, context switches to B
  - browser back returns to journal without broken state

Status (2026-03-20):
- Implemented:
  - Journal sidebar entry links now target canonical non-scoped `/journal/{period}` URLs.
  - Header/FAB journal entry links now target canonical `/journal/{period}` daily URLs.
  - Journal previous/next navigation in the note header now navigates via `/journal/{period}`.
  - Browser coverage added for journal context behavior:
    - opening journal while active workspace is A keeps context A
    - navigating to workspace-B scoped note shows context B
    - browser back returns to journal route with stable context/JS state
- Pending:
  - None.


### Step ?: Some remarks
- Open decisions:
  - Should a user be able to attach a note from a different workspace to their event?
  - If yes, should multiple users be able to attach their own personal meeting notes to the same shared note?
  - Should wiki-links from personal journals/meetings resolve to notes outside personal workspace (within memberships)?
---

## What Is Still Relevant

1. Improvement Path 2a: Cross-workspace wiki-link resolution for journal/meeting contexts.
2. Improvement Path 2b: Cross-workspace backlinks filtered to current user privacy boundary.
3. Improvement Path 2c/2d: Meeting-note subject linking and explicit workspace-switch behavior when following cross-workspace links.
4. Product decision finalization for event attachment + cross-workspace link boundaries.

## PR Breakdown (Suggested)

1. **PR A:** personal workspace lifecycle guardrails (delete/transfer/erase) + tests. (completed)
2. **PR B:** personal workspace resolver + journal restriction to personal workspace. (completed)
3. **PR C:** new `/journal/...` routes + controller wiring + middleware context guard. (completed)
4. **PR D:** sidebar/frontend route updates + browser tests. (completed)
5. **PR E:** cross-workspace link/backlink schema + query updates.

## Recommended Next Slice

Implement **PR E, part 1 (Path 2a only)**:

1. Add cross-workspace wiki-link resolution for journal/meeting note contexts, restricted to workspaces the current user can access.
2. Keep non-journal/non-meeting wiki-link resolution unchanged for now (workspace-local).
3. Add feature tests for:
   - personal journal wiki-link resolves to shared workspace note
   - no resolution outside user memberships
   - stable fallback behavior when multiple matches exist.

This is the highest-value next step because it unlocks the main cross-workspace use case while keeping risk bounded before backlink/query model expansion.

---

## Rollback Strategy

- Keep old `/w/{workspace}/journal/...` routes active until PR C is stable in production.
- Feature-flag cross-workspace backlink queries separately from route changes.
- If issues occur, route generation can be reverted to workspace-scoped URLs without data migration rollback.
