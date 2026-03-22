# Note Show Response Optimization Plan

## Context

Investigated Telescope request `a15cdee8-5942-42f1-995d-645be5f56cb8` (`GET /journal/2026-03-16`).

Observed response payload size (Inertia `data.page.props`): **~115,917 bytes (~113 KB)**.

Largest props:

- `linkableNotes`: **57,801 B**
- `translations`: **21,552 B**
- `content`: **13,340 B**
- `notesTree`: **6,594 B**
- `workspaceMeetingParentOptions`: **3,844 B**
- `workspaceLinkableNotes`: **3,259 B**
- `moveParentOptions`: **3,121 B**

## Goal

Reduce first-page note payload size significantly on every note navigation, while preserving editor behavior and UX.

## Phase 1 (Highest Impact, Lowest Risk)

### 1. Defer heavy note-linking props

Move these from eager page props to deferred/async loading:

- `linkableNotes`
- `workspaceLinkableNotes`
- `moveParentOptions`
- `workspaceMeetingParentOptions`

Rationale: these are only needed for autocomplete/move/attach flows, not initial content paint.

Implementation:

- In `NotesController@renderNotePage`, wrap these props in `Inertia::defer(...)`.
- Group related deferred props under one key (e.g. `note-linking`) to avoid too many follow-up requests.

### 2. Keep initial page lean

Initial response should contain only:

- editor-required data (`content`, `noteId`, URLs, `editorMode`, etc.)
- compact context (`noteActions`, `breadcrumbs`, `currentWorkspace`)
- already-deferred `relatedTasks`/`backlinks` stays deferred.

### 3. Exclude Inertia partials from page-visit tracking

Already implemented: Inertia partial XHR requests should not be tagged as page visits in Telescope.

## Phase 2 (Medium Impact)

### 4. Slim `linkableNotes` shape

Current shape contains fields not needed for initial command list rendering.
Split into:

- **base list**: `id`, `title`, minimal `path`, `href`, workspace marker
- **on-demand details** (when item selected or query expanded): headings + extra metadata

### 5. Reduce notes tree payload for note-show

If note show only needs a subset of tree fields, create a lighter serializer specifically for show page.

### 6. Translation payload audit

`translations` is ~21 KB.

Actions:

- send only namespaces used by note show/editor components
- avoid injecting unrelated translation groups on this page

## Phase 3 (Optional, Advanced)

### 7. Cache/stamp stable props

Cache or memoize expensive derived props keyed by:

- note id
- note updated timestamp
- workspace updated timestamp (for tree/linkable data)

### 8. Route-level split (if needed)

Expose dedicated endpoints for:

- linkable notes search results
- move target options
- meeting attach targets

Only fetch when corresponding UI opens.

## Acceptance Criteria

### Payload

- Initial note/journal show payload reduced from ~116 KB to **< 60 KB** (target), ideally **< 45 KB**.
- `linkableNotes` no longer included in initial response body.

### Behavior

- Editor opens with no regressions.
- Wiki-link autocomplete still works after deferred props load.
- Move/attach dialogs still function.

### Observability

- Telescope request list shows only true page visits as `page-visit`.
- Deferred partials are visible as request entries but not tagged as page visits.

## Rollout Order

1. Defer heavy linking/move props.
2. Validate note show + wiki-link + move dialog behavior.
3. Translation namespace trimming.
4. Optional cache/split endpoints.
