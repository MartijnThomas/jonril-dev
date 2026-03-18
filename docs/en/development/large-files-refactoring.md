---
title: Large Files — Refactoring Advice
section: Development
---

# Large Files — Refactoring Advice

This document lists the largest files in the codebase and offers concrete advice on how to break each one down. These are not urgent rewrites — treat this as a roadmap to reach for when touching a file anyway.

---

## Overview

| File | Lines | Primary problem |
|---|---|---|
| `resources/js/pages/tasks/index.tsx` | 1 980 ↓ | Single component doing filter state, presets, UI, and rendering |
| `app/Http/Controllers/NotesController.php` | 1 918 | God controller — creation, display, mutation, linking, rendering helpers |
| `app/Http/Controllers/TasksController.php` | 1 544 | Query building, preset management, check updates, migration all in one |
| `resources/js/components/tiptap-properties/document-properties.tsx` | 1 514 | Mixed state logic, popovers, and rendering in one component |
| `resources/js/components/tiptap-templates/simple/block-tree/block-tree-model.ts` | 1 299 | One module for types, parsers, formatters, and editor mutations |
| `resources/js/pages/workspaces/settings.tsx` | 1 144 | Four distinct settings sections in one page component |
| `resources/js/components/app-command-palette.tsx` | 1 008 | Keyboard handling, search, recent items, and rendering merged together |
| `resources/js/components/right-sidebar-today-events.tsx` | 811 | Formatting utilities, list rendering, and actions mixed in one component |
| `app/Http/Middleware/HandleInertiaRequests.php` | 535 | Share method delegates to many private helpers — the helpers should be services |

---

## 1. `resources/js/pages/tasks/index.tsx` — 2 259 lines

### Problem
Everything lives in one massive component: type definitions, filter state normalisation, date preset logic, workspace/note scope pickers, status filters, preset CRUD, task list rendering, note tree rendering, and the migration detail panel.

### Suggested breakdown

**Extract hooks:**
- ~~`useTaskFilters(initialFilters)`~~ ✓ Done 2026-03-18 — extracted to `resources/js/hooks/use-task-filters.ts` (432 lines). Manages filter state, normalisation, date preset logic, status/grouping options, preset CRUD, workspace/note scope toggles. `Filters` and `FilterPreset` types exported from the hook.
- `useTaskFilterPresets(workspaceId)` — save, delete, apply presets; keep localStorage state (~150 lines)
- `useTaskDatePresets()` — date range resolution for each preset string (~80 lines)

**Extract components:**
- `<TaskWorkspaceScopeFilter>` — the workspace + note scope popover (~300 lines → `components/tasks/task-workspace-scope-filter.tsx`)
- `<TaskStatusFilter>` — status multi-select group (~150 lines)
- `<TaskDateFilter>` — date preset + custom range picker (~150 lines)
- `<TaskFilterPresetManager>` — preset dropdown, save dialog, delete confirmation (~200 lines)
- `<TaskListGroup>` — renders one group header + its task rows (~200 lines)
- `<TaskNoteTree>` — the nested note tree render inside filter panel (~180 lines)

**Move types:**
- All remaining `type`/`interface` declarations at the top of the file → `types/tasks.ts`

**Result:** Main page component shrinks to ~400–500 lines of wiring. Each extracted file is independently readable.

---

## 2. `app/Http/Controllers/NotesController.php` — 1 918 lines

### Problem
A classic god controller. It handles note creation, display routing, content updates, revisions, event linking, and provides 300+ lines of page-rendering helper logic (`renderNotePage`, `buildBreadcrumbs`, `buildNotesTreeLevel`, etc.).

### Suggested breakdown

**Extract service classes** (in `app/Support/Notes/`):

- `NotePageRenderer` — `renderNotePage()`, `buildBreadcrumbs()`, `resolveContentHash()` (~300 lines)
- `NoteTreeBuilder` — `buildNotesTreeLevel()` and its closures (~250 lines; already has private helpers that belong together)
- `NoteRevisionService` — `showRevisions()`, `restoreRevision()` (~120 lines; logic is self-contained)
- `NoteEventLinker` — `attachToEvent()`, `detachFromEvent()`, `linkMeetingNoteToEvent()` (~140 lines)

**Consider splitting the controller:**
- `NotesController` — create, show, update, delete (the CRUD surface)
- `NoteRevisionController` — revision listing and restore
- `NoteTreeController` — the `/notes/tree` JSON endpoint (currently `buildNotesTreeLevel` is 250 lines of a private method)

**Result:** Controller drops to ~600 lines; each service is independently testable.

---

## 3. `app/Http/Controllers/TasksController.php` — 1 544 lines

### Problem
The `index()` method alone builds a complex query (status filters, date presets, workspace scoping, note scoping) and is ~350 lines. Migration logic, check-update logic, and preset management are also in the same file.

### Suggested breakdown

**Extract service classes:**

- `TaskQueryBuilder` (or `TaskFilterApplier`) — takes validated filter inputs, applies all `->when()` clauses, returns a query builder (~350 lines; this is the core complexity)
- `TaskMigrationService` — `migrate()`, `migrateTaskBetweenNotes()`, `walkAndMigrateTask()`, `migrateTargets()` (~250 lines; self-contained operation)
- `TaskCheckService` — `updateChecked()`, `updateCheckedByReference()` and helpers (~130 lines)

**Extract a date preset resolver:**
- `DatePresetResolver::resolve(string $preset, string $timezone): array{from, to}` — a simple value object or static utility (~60 lines; currently duplicated between tasks and the frontend)

**Consider splitting the controller:**
- `TasksController` — index, show-related actions
- `TaskMigrationController` — migrate endpoints
- `TaskStateController` — check/uncheck endpoints

**Result:** Controller drops to ~500 lines; `TaskQueryBuilder` becomes independently testable with Pest unit tests.

---

## 4. `resources/js/components/tiptap-properties/document-properties.tsx` — 1 514 lines

### Problem
One component contains: a full `TokenPropertyInput` sub-component (240 lines), property row state management, focus management effects, popover renderers for keys and values, and the full list rendering.

### Suggested breakdown

**Extract components:**
- `<TokenPropertyInput>` → `tiptap-properties/token-property-input.tsx` (already a coherent component, ~240 lines)
- `<PropertyKeyPopover>` → `tiptap-properties/property-key-popover.tsx` (~150 lines)
- `<PropertyValuePopover>` → `tiptap-properties/property-value-popover.tsx` (~150 lines)
- `<PropertyRowsList>` → `tiptap-properties/property-rows-list.tsx` (~200 lines)

**Extract hooks:**
- `usePropertyRows(initialProperties, onChange)` — draft row state, add/commit/rename/update/delete operations (~200 lines → `hooks/use-property-rows.ts`)
- `usePropertyFocus(rows)` — focus management side-effects (~60 lines)

**Result:** Main component drops to ~200–300 lines; `TokenPropertyInput` becomes reusable elsewhere.

---

## 5. `resources/js/components/tiptap-templates/simple/block-tree/block-tree-model.ts` — 1 299 lines

### Problem
One file mixes type definitions, task status parsing/formatting, date token parsing, priority parsing, and all editor-mutation functions (indent, style, toggle, etc.).

### Suggested breakdown

Split into focused modules within the same `block-tree/` directory:

- `block-tree-types.ts` — all exported types and interfaces (~60 lines)
- `block-tree-task-status.ts` — `normalizeTaskStatus`, `taskStatusToken`, `taskStatusTextPrefix`, status cycle logic (~120 lines)
- `block-tree-date-parser.ts` — `parseBlockTaskDateTokens`, `parseBlockTaskPriority`, date formatting helpers (~180 lines)
- `block-tree-style-ops.ts` — `setCurrentParagraphStyle`, `indentCurrentParagraph`, `outdentCurrentParagraph` (~250 lines)
- `block-tree-sync.ts` — text synchronisation between Tiptap content and block model (~200 lines)
- `block-tree-model.ts` — re-exports everything + the remaining orchestration logic (keeps the public API stable)

**Result:** Each module is ~150–250 lines and can be read in isolation. `block-tree-model.ts` becomes the public barrel file.

---

## 6. `resources/js/pages/workspaces/settings.tsx` — 1 144 lines

### Problem
Four logically independent settings sections (general, members, calendar, advanced/danger) are rendered inside one page component, sharing one large props type.

### Suggested breakdown

Create a `components/workspace-settings/` directory:

- `<GeneralSettingsSection>` — name, icon, colour, editor mode forms (~250 lines)
- `<MembersManagementSection>` — member list, invite, role change, remove (~200 lines)
- `<CalendarIntegrationSection>` — CalDAV sync configuration (~200 lines)
- `<AdvancedSettingsSection>` — workspace migration, delete zone (~150 lines)

Each section receives only the props it needs — no more passing the full settings blob everywhere.

**Extract hook:**
- `useWorkspaceSettingsForms(props)` — one hook that initialises all `useForm()` instances and submit handlers (~200 lines → hook file)

**Result:** Page component shrinks to ~150 lines of layout + section composition.

---

## 7. `resources/js/components/app-command-palette.tsx` — 1 008 lines

### Problem
Keyboard binding, recent items persistence, search/filter logic, command definitions, and rendering are all in one component.

### Suggested breakdown

**Extract hooks:**
- `useCommandPaletteKeyboard(open, setOpen)` — all `useEffect` + `keydown` handling (~160 lines → `hooks/use-command-palette-keyboard.ts`)
- `useRecentItems(maxItems)` — localStorage read/write for recently visited notes (~80 lines → `hooks/use-recent-items.ts`)
- `useCommandSearch(query, pages, notes, headings)` — filtering and grouping of results (~100 lines)

**Extract data:**
- Command action definitions (the array of `{ id, label, action }` objects) → `lib/command-palette-commands.ts` (~150 lines)

**Extract components:**
- `<CommandResultGroup>` — renders a labelled group of results (~100 lines)
- `<CommandPaletteEmpty>` — empty/no-results state

**Result:** Main component drops to ~300 lines of composition.

---

## 8. `resources/js/components/right-sidebar-today-events.tsx` — 811 lines

### Problem
Time-formatting utilities, individual event card rendering, action menus, and the top-level list are all in one file.

### Suggested breakdown

**Extract utilities:**
- `lib/event-time-formatting.ts` — `formatTimeRange`, `formatDurationLabel`, `formatGapLabel`, and related pure functions (~135 lines)

**Extract components:**
- `<EventListItem>` — one event row (time, title, metadata, gap indicator) (~200 lines → `components/event-list-item.tsx`)
- `<EventActionsMenu>` — the dropdown (link to note, unlink, open CalDAV) (~80 lines)
- `<EventTimeline>` — the ordered list + gap logic (~100 lines)

**Extract hook:**
- `useEventTiming(events)` — now/current-event tracking, refresh interval (~80 lines)

**Result:** Main component drops to ~250 lines.

---

## 9. `app/Http/Middleware/HandleInertiaRequests.php` — 535 lines

### Problem
The `share()` method is the entry point, but the real work is done by 10+ private methods that build notes trees, workspace summaries, linkable note lists, translations, etc. These are not middleware concerns — they are data-preparation concerns.

### Suggested breakdown

**Extract a `SharedPropsBuilder` class** (or several focused services):
- `WorkspaceSharedDataBuilder` — `workspaceSummary()`, `workspaceNoteCounts()`, `buildNotesTree()`, `workspaceLinkableNotes()`, `workspaceMeetingParentOptions()` (~350 lines → `app/Support/Inertia/WorkspaceSharedDataBuilder.php`)
- `UserLocaleResolver` — `resolveLocale()`, `resolveUserTimezone()`, `cachedUiTranslations()` (~100 lines)

The middleware itself becomes ~80 lines: instantiate the builders, call them, and return the array.

**Result:** Middleware is easy to read; builders are independently testable.

---

## Prioritisation

Break down files in this order — highest ROI first:

1. ~~**`tasks/index.tsx`** — `useTaskFilters` hook extracted~~ ✓ Done 2026-03-18 (2 305 → 1 980 lines). Remaining: component extractions and `useTaskFilterPresets`.
2. **`NotesController.php`** — most likely to keep growing as features are added
3. **`document-properties.tsx`** — `TokenPropertyInput` is already a coherent component, easy win
4. **`TasksController.php`** — extract `TaskQueryBuilder` before adding full-text search filter
5. **`workspaces/settings.tsx`** — section split is mechanical and safe
6. **`app-command-palette.tsx`** — hooks extraction makes it easier to add new command sources
7. **`block-tree-model.ts`** — split into modules when next adding a date/status feature
8. **`HandleInertiaRequests.php`** — extract `WorkspaceSharedDataBuilder` when next adding a shared prop
