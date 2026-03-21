# Tasks Kanban Page Plan

## Goal

Add a dedicated **Kanban tasks page** as a new route/page (no new kanban logic inside the existing tasks list page), while reusing the extracted task filter logic.

Initial column mapping (v1):

- Backlog: `backlog`
- New: `open` (no explicit task status)
- Doing: `in_progress`, `assigned`, `deferred`
- Done: `closed`

Longer-term goal:

- user-defined board columns
- user-defined mapping from task statuses to columns

## UX direction

Reference style direction:

- https://shadcnuikit.com/dashboard/apps/kanban

Implementation target:

- keep the same visual language as current app (not a direct clone)
- use existing shadcn/ui primitives already used in project
- keep responsive behavior predictable first, then polish interactions

## Scope (v1)

In scope:

- New page: `/tasks/kanban`
- New controller action for Kanban payload
- Reuse existing task filtering logic/parsing
- Fixed default 4-column board using mapping above
- Render task cards with essential metadata
- Preserve current task actions where practical (open note, toggle status, cancel, migrate)

Out of scope (v1):

- Custom column definitions
- Drag-and-drop persistence between columns
- WIP limits, swimlanes, multi-board presets
- Replacing existing `/tasks` list page

## Architecture

### Routing and backend

- Add a new page endpoint for Kanban (separate action/method from current tasks index endpoint).
- Keep existing tasks index response untouched.
- Reuse current filters parsing and normalization layer (same source of truth).

### Data retrieval strategy

- Keep current search/filter source behavior aligned with existing tasks page.
- Group returned tasks into board columns server-side for predictable ordering and pagination strategy.
- Return both:
  - normalized filter state
  - grouped column payload

### Column mapping rules (v1)

- `Backlog`:
  - task status `backlog`
- `New`:
  - open tasks without explicit status token/state
- `Doing`:
  - `in_progress`, `assigned`, `deferred`
- `Done`:
  - closed/completed tasks

Notes:

- `canceled` and `migrated` are not part of default board columns in v1 unless explicitly included by filters.
- exact final handling should follow current filter semantics already used in tasks list.

## Frontend plan

### New page component

Create a dedicated Inertia page:

- `resources/js/pages/tasks/kanban.tsx`

### Reused components

- existing task inline content renderer where possible
- existing task checkbox/status icon logic where possible
- existing filters hook and controls (reuse, not duplicate logic)

### New components (kanban-specific)

- Kanban board container
- Column component
- Task card component
- Optional sticky filter bar variant for Kanban layout

### UI primitives and libraries

- shadcn/ui existing primitives (`Card`, `Button`, `DropdownMenu`, `ScrollArea`, etc.)
- Tailwind CSS v4 utility styling (existing theme tokens)
- Optional DnD foundation for later phase:
  - `@dnd-kit/core`
  - `@dnd-kit/sortable`
  - only when we start interactive card moves

## Filtering integration

- Reuse extracted filter logic from tasks list page.
- Keep query parameter contract compatible where possible.
- Ensure filters affect both pages consistently.
- Add a simple toggle/link to switch List <-> Kanban while preserving filters.

## Performance considerations

- Keep first version paged or capped per column to avoid rendering very large boards.
- Prefer lazy column rendering for heavy datasets (if needed after initial pass).
- Keep card payload minimal for initial render; fetch more only if required.

## Future phase: user-defined columns

Planned model direction:

- `task_boards` (owner/user or workspace scoped, decision pending)
- `task_board_columns` with explicit order and title
- `task_board_column_statuses` (many-to-many mapping to statuses)

Behavior:

- default board generated from v1 fixed mapping
- user can create custom board config later
- board config should remain compatible with existing filters

## Testing plan

### Backend feature tests

- Kanban endpoint returns grouped columns with expected mapping
- Existing filters apply correctly to Kanban results
- Status grouping respects default mapping
- Link/switch between list and kanban preserves filters

### Frontend/browser tests

- Kanban page renders all default columns
- Tasks appear in correct column by status
- Basic task actions from card work
- Filter interactions update visible cards correctly

## Rollout plan

Phase 1:

- Add backend endpoint + frontend page scaffold
- Render board with fixed columns and mapped tasks
- Reuse filter logic

Phase 2:

- Polish UI and interaction quality
- Add incremental performance improvements

Phase 3:

- Introduce persisted custom columns and status mapping

## Acceptance criteria (v1)

- New dedicated Kanban page exists and is reachable from tasks navigation.
- Existing tasks list page is not overloaded with Kanban-specific logic.
- Filters behave consistently between list and Kanban.
- Tasks are grouped into Backlog/New/Doing/Done using the agreed mapping.
- Design is aligned with current app style and shadcn-based patterns.

## Current status (2026-03-21)

Implemented:

- Dedicated page and route: `/tasks/kanban`
- Dedicated backend action and payload wiring for Kanban
- Shared filter parsing/normalization via existing task filter logic
- List <-> Kanban switch while preserving query parameters
- Fixed default 4 columns rendered (Backlog, New, Doing, Done)
- Workspace + note-tree filtering UI in Kanban (same interaction model as list)
- Column-level scrolling in Kanban layout
- Columns can be collapsed/expanded; collapsed columns show label + count
- Added `Canceled` column (collapsed by default)
- Collapsed columns are count-only; card payload is loaded only for expanded columns (`include_columns[]`)
- Backend feature tests for Kanban route/mapping/filter behavior

Behavior differences from initial draft:

- Done mapping is currently based on checked/completed semantics used in-app.
- Some status aliases/legacy values are normalized for Kanban grouping.
- Grouping filter control is intentionally hidden on Kanban UI.

## Open performance note

- Query strategy must keep large `Done` sets efficient.
- Current behavior:
  - collapsed columns: backend returns `task_count` with no card payload
  - expanded columns: frontend requests via `include_columns[]` and backend returns cards for those columns
  - default expanded columns: `backlog`, `new`, `doing`
  - default collapsed columns: `done`, `canceled`
- Follow-up optimization:
  - add optional pagination/windowing specifically for expanded `Done` cards on very large sets
