# Legacy Editor Removal Plan

## Status Snapshot (March 20, 2026)

- This plan is still relevant.
- Legacy support remains in runtime/controller/test surface.
- Workspace settings now hide editor-mode switch + migrate action for workspaces already in block mode, but legacy-only flows still exist for legacy workspaces.
- New workspace creation still defaults to `legacy`, so Phase 1 is not complete yet.

## Goal

Track all code paths, UX touchpoints, migrations, and cleanup work required to fully remove legacy editor support after block mode rollout is complete.

## Scope

- Backend flags and behavior branches that support `editor_mode = legacy`.
- Frontend UI controls and screens that expose legacy/block switching.
- Commands and migration tooling that exist only to convert legacy workspaces.
- Tests, docs, and deploy scripts tied to legacy-editor support.

## Current State Inventory

### Workspace settings / UX

- Advanced settings:
  - for legacy workspaces: editor mode selector (`legacy` / `block`) and migrate-to-block action are still present
  - for block workspaces: editor mode selector and migrate action are hidden
  - migrated-workspace messaging/reactivation controls still exist where applicable

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
- [x] Hide legacy migration controls for block workspaces and keep migration UI scoped to legacy workspaces.
- [ ] Decide legacy-workspace runtime policy during transition (editable vs read-only) and enforce consistently.

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

## Recommended Next Step

Finish **Phase 1** first:

1. Default new workspaces to `block` in backend (`WorkspaceController@store`) and UI forms.
2. Remove legacy option from workspace creation/edit flows.
3. Add/adjust feature tests to lock block-only creation behavior.

This reduces new legacy surface area before touching runtime branch removals in later phases.
