# Note Properties As First-Class Editor Content

## Goal

Make note properties/frontmatter native editor content, shown below the note title and editable in-place.

This plan merges:

1. title/meeting-meta-in-editor direction
2. first-class properties architecture

## Key decisions

1. The first line remains the official note title (`h1`) and maps to `notes.title`.
2. The `title` property is **not** derived from `h1`; it is a custom override/alias field (`property:title`) in the properties area.
3. Properties are part of the document JSON itself, not a separate hidden store.
4. `notes.meta` remains a derived projection for fast reads and indexing.

## Canonical document structure

Top of document:

1. `h1` official note title (required first block)
2. zero or more property rows directly under title
3. normal note body

For meeting notes, first implementation uses required property rows:

1. `meeting.when`
2. `meeting.where`
3. `meeting.who`

## Data model

Represent property rows as structured editor nodes.

Recommended attrs:

1. `propertyKey`
2. `propertyType` (`text`, `date`, `datetime`, `people`, `enum`, `bool`, `number`)
3. `propertyValue`
4. `visibility` (`inline` or `hidden`)
5. `locked` (system-managed property guard)

Projection:

1. `notes.title` from first `h1`
2. `notes.meta` from property nodes
3. type-specific projections (meeting event fields, birthday-derived signals, etc.)

## Save and normalization pipeline

On save:

1. normalize top structure (first block must be `h1`)
2. normalize property nodes (unique keys, stable ordering for system keys)
3. parse property nodes to typed map
4. write projections (`notes.meta` + type-specific mirrors)
5. trigger indexers/jobs based on diff

Rules:

1. idempotent normalization only
2. never rewrite unaffected nodes
3. no separate write path for meeting meta outside editor content

## How users add/edit properties in editor

Recommended UX pattern (hybrid):

1. Primary: gutter “+” context menu action `Add property` with searchable property types.
2. Secondary power-user syntax: command-style insert, not markdown-like inline parsing.

Why:

1. syntax like `::title:: value` is fast for power users but error-prone and hard to validate.
2. menu insertion guarantees valid node shape and consistent keys/types.

Concrete proposal:

1. `Add property` in gutter menu opens searchable picker.
2. Picking a property inserts a property row node below title/properties section.
3. Optional slash command can call same insertion flow.
4. Do not use freeform parser as primary source of truth.

Common patterns in other editors:

1. Notion/Coda-style structured rows and slash commands.
2. Obsidian/YAML frontmatter text syntax (powerful but brittle in mixed editing).
3. Hybrid systems where UI inserts structured data and users can still edit value text.

This plan follows the hybrid pattern.

## Meeting notes first (implementation start)

Phase 1 scope:

1. enforce title-first (`h1` first line)
2. introduce property rows for meeting notes (`when/where/who`)
3. render properties below title in editor
4. keep sidebar/header meeting widgets as read-only mirrors initially
5. sync meeting property rows to existing meeting event fields on save

Out of scope for phase 1:

1. full custom property system for all note types
2. removing existing properties panel

## Migration and compatibility

1. create migration/reconcile path that materializes missing meeting property nodes from existing meeting metadata.
2. keep dual-read fallback temporarily:
   - prefer property nodes
   - fallback to legacy fields when nodes missing
3. remove fallback after stability window.

Suggested command:

1. `notes:reconcile-properties`

## Indexing and query strategy

1. UI reads should rely on projections/index tables, not raw JSON scanning.
2. Daily signals, related panels, search integration should consume projected values.
3. Property schema registry defines validation, applicability, and indexing hints per key.

## Risks, downsides, and why this might be a bad idea

1. More complex editor model:
   - structured nodes increase extension complexity and regression risk.
2. User mental model overhead:
   - properties in body may feel noisy if not visually compact.
3. Merge/conflict complexity:
   - top-of-document structured rows are high-churn in collaborative edits.
4. Payload growth:
   - document JSON grows; needs projection/index discipline.
5. Migration risk:
   - mixed legacy + new states can cause drift during rollout.
6. Potential over-engineering:
   - if only a few fixed fields are needed, full property framework may be heavier than necessary.

Mitigations:

1. strict phased rollout (meeting first)
2. opt-in rendering polish (compact property row UI)
3. reconcile command + telemetry + focused browser tests

## Recommended phased rollout

### Phase 1: Meeting property rows

1. title-first enforcement
2. property row node support (minimal keys)
3. meeting `when/where/who` rows + save sync
4. tests (feature + browser)

### Phase 2: Generalize properties

1. schema registry
2. gutter insertion flow for properties
3. property panel bound to same nodes

### Phase 3: Legacy cleanup

1. remove parallel legacy write paths
2. finalize projection-only backend model
