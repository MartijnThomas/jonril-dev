# Journal Notes & Personal Workspace Plan

## Current State

- Every note (including journal notes) belongs to a workspace via `workspace_id`.
- Journal notes are unique per `(workspace_id, journal_granularity, journal_date)`.
- All routes are workspace-scoped: `/w/{workspace}/journal/{granularity}/{period}`.
- Switching workspaces updates `user.settings['workspace_id']` and redirects to the journal or notes index of the target workspace.
- Users can have multiple workspaces. The personal workspace is auto-created on registration.

---

## Phase 1: Single Personal Workspace with Journal Notes

### Goal

Each user has exactly one workspace — their **personal workspace**. No workspace switching needed. Journal notes live in this workspace.

### What Changes

**Backend**

- Remove the ability to create additional workspaces for regular users (gate `WorkspaceController@store`).
- The workspace switcher is no longer relevant; hide it from the UI.
- The personal workspace can be identified by a flag (`is_personal: bool`) on the `workspaces` table, set to `true` on auto-creation during registration.
- No migration needed for existing data; users with multiple workspaces are unaffected at the model level.

**Frontend**

- Hide the `WorkspaceSwitcher` component from the sidebar when the user has only one workspace (or always, if multi-workspace support is dropped entirely).
- Remove workspace-context labels from the UI (e.g., workspace name in breadcrumbs) when there is only one workspace.
- The journal sidebar entry links directly to `/w/{personal-workspace-slug}/journal/...` — functionally identical to today, just without the switcher.

### What Stays the Same

- All routes remain workspace-scoped internally (`/w/{slug}/...`). No route changes needed.
- Journal notes remain stored as `TYPE_JOURNAL` notes on the workspace.
- `JournalNoteService` is unchanged.

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
2. Add `source_workspace_id` / `target_workspace_id` to link tables.
3. Update wiki-link resolver to search across workspaces for journal/meeting note contexts.
4. Update backlink queries to include cross-workspace sources filtered by current user.
5. Add `linked_note_id` to notes for meeting note subjects.
