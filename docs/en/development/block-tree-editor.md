# Block-tree editor

This document is the source of truth for the `block` editor architecture.

## Architectural decision

`block` is no longer a list-based editor.

It is a block editor.

That means:

- the core unit is a block
- a block is edited independently
- indentation is block-local state
- old list-container semantics are not part of the target design

## Hard constraints

These constraints are intentional and should not be relaxed during implementation:

1. `block` must not reuse the current list / task / checklist architecture as its internal model.
2. `block` must not use list containers as the source of truth for editing behavior.
3. Converting one block's state must never affect siblings.
4. Indentation must be stored on the block itself.
5. The first implementation should stay extremely small: headings and paragraphs first.

## Reset decision

The earlier `block` experiment should be treated as abandoned scaffolding.

It introduced too much hidden carry-over from the legacy editor:

- list-based node thinking
- list-based toolbar behavior
- list-based conversion assumptions
- compatibility-shaped internal structure

That path is no longer the implementation direction.

## First implementation target

Start with only:

- heading
- paragraph

And only one block-level attr on paragraphs:

- `indent`

There are no list, task, checklist, or quote styles in the current `block` implementation.

## Editing behavior

### `Tab`

- increase the current block's `indent`
- affect only the current block

### `Shift-Tab`

- decrease the current block's `indent`
- if the block is already at the highest level, do nothing

### `Backspace`

- if the cursor is before the first character in the block, behave like `Shift-Tab`
- affect only the current block
- never mutate a parent or sibling as a side effect

## Deliberate simplification

The first implementation does **not** start with:

- nested list containers
- subtree movement
- compatibility-driven custom list nodes
- tasks
- checklists
- quotes
- custom markers
- bubble menu
- mobile toolbar

Those concerns can come later if the flat block model proves out.

The immediate goal is to get a clean, predictable, minimal block editor working first.

## Rendering

Rendering is secondary to the model.

For the first slice:

- headings render as headings
- paragraphs render with left padding based on `indent`
- there are no markers or checkboxes
- a sticky toolbar at the top of the editor exposes only:
  - buttons for `Paragraph`
  - buttons for `H1`
  - buttons for `H2`
  - buttons for `H3`
  - buttons for `H4`
  - buttons for `H5`
  - buttons for `H6`

We will iterate on visuals later.

## Indexer expectations

For now there is no task indexing behavior in `block` mode. The mode is heading/paragraph only.

## Migration approach

There is no legacy runtime compatibility inside the editor.

That means:

- `block` mode accepts only block documents
- old note JSON is not translated inside the editor runtime
- any future conversion from legacy note JSON must be a separate migration or import step
- legacy shape must not influence the internal block editor model

## What stays valid from previous work

These pieces are still useful and should stay:

- workspace-level `editor_mode`
- one editor shell
- block mode status indicator
- isolated `block` extension entry point

## What must be removed from `block`

The active `block` implementation should remove:

- legacy list behavior
- legacy task / checklist behavior
- list-container-based keyboard behavior
- list-based toolbar semantics
- compatibility-shaped internal schema decisions

## Rollout checklist

Stable rollout scaffolding:

- ~~Add a workspace-level `editor_mode` flag~~
- ~~Keep one editor shell and switch behavior by extension pack~~
- ~~Add a visible indicator that block mode is active~~

Architectural reset:

- ~~Decide that `block` is a real block editor, not a list editor~~
- ~~Abandon the list-based `block` experiment~~
- ~~Lock the design to headings + paragraphs first~~

Next implementation slices:

- ~~Strip `block` mode back to a minimal clean pack~~
- ~~Define the minimal block schema for headings and paragraphs~~
- ~~Add paragraph-local `indent`~~
- ~~Implement block-local `Tab`, `Shift-Tab`, and `Backspace`~~
- ~~Disable block-mode bubble menu and mobile toolbar~~
- Add focused regression tests for block-local editing behavior
- Revisit styling after the minimal editor is stable
- Revisit indexing after the minimal editor is stable

## Implementation guidance

- avoid one huge extension file
- split by domain

Suggested domains:

- block schema
- block attrs and rendering
- block keyboard behavior
- block editor specific tests
