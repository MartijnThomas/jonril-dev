# Legacy Editor Removal Plan

## Goal

Track all code paths, UX touchpoints, migrations, and cleanup work required to fully remove legacy editor support after block mode rollout is complete.

## Scope

- Backend flags and behavior branches that support `editor_mode = legacy`.
- Frontend UI controls and screens that expose legacy/block switching.
- Commands and migration tooling that exist only to convert legacy workspaces.
- Tests, docs, and deploy scripts tied to legacy-editor support.

## Current State Inventory

### Workspace settings / UX

- Advanced settings contains:
  - editor mode selector (`legacy` / `block`)
  - migrate-to-block action
  - migrated-workspace messaging and reactivation controls

### Backend

- `workspaces.editor_mode` supports `legacy` and `block`.
- Workspace conversion command exists:
  - `notes:convert-workspace-to-block`
- Workspace migration status:
  - `workspaces.migrated_at`
- Workspace controller has migration and reactivation endpoints.

### Tests

- Feature tests for migration and reactivation behavior exist in workspace settings and conversion command test suites.

## Removal Checklist (Draft)

### Phase 1: Freeze Legacy Creation

- [ ] Remove all UI options that let users choose `legacy` mode.
- [ ] Ensure all newly created workspaces are `block` mode only.
- [ ] Keep read-only display for existing legacy workspaces during transition.

### Phase 2: Complete Legacy Workspace Migration

- [ ] Identify remaining legacy workspaces in production.
- [ ] Migrate remaining legacy workspaces to block mode.
- [ ] Verify post-migration integrity (notes, journal notes, tasks, links, events).

### Phase 3: Remove Legacy Runtime Branches

- [ ] Remove backend runtime logic that branches on legacy editor mode.
- [ ] Remove migration/reactivation endpoints from workspace settings flow.
- [ ] Remove legacy-specific command paths no longer needed in app runtime.

### Phase 4: Remove Legacy Data Model Surface

- [ ] Decide whether `workspaces.editor_mode` can be simplified or dropped.
- [ ] Decide whether `workspaces.migrated_at` remains useful; drop if obsolete.
- [ ] Add forward-only migration(s) for final schema cleanup.

### Phase 5: Cleanup Tests / Docs / Deploy

- [ ] Delete or rewrite tests that cover legacy-specific behaviors.
- [ ] Update user/admin docs to block-only editor model.
- [ ] Remove legacy migration command references from deploy/runbooks.

## Open Questions

- When do we define a hard cutoff date for legacy workspace support?
- Do we keep conversion command available as a safety tool, or remove it after migration window?
- Do we preserve legacy-related metrics/events for audit, or remove entirely?

## Next Update

Update this document whenever a legacy-related endpoint, UI action, command, or schema element is removed.
