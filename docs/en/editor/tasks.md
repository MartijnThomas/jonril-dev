# Tasks

This page documents how tasks work in the editor, including status markers, priorities, dates, and migration.

## Task syntax

Create a task item with:

- `* ` at the start of a line
- `/task` slash command

You can also use:

- `- ` for a normal bullet list item
- `+ ` for a checklist item (not indexed as a task)

## Status markers

Status markers are read from the start of a task line.

- `?` -> `backlog`
- `/` -> `in_progress`
- `<` -> `assigned`
- `*` -> `starred`
- `—` -> `canceled`

Examples in notes:

```text
/ Work on release notes
? Triaged ideas for next sprint
< Waiting for legal review
* Save this idea for later
— No longer needed
```

Rendered (conceptual):

- In progress: open task with in-progress icon treatment
- Backlog: open task with backlog icon treatment
- Assigned: open task with assigned marker treatment
- Starred: open task with starred treatment
- Canceled: closed/canceled task styling

## Priority markers

Priority markers are read after an optional status marker.

- `!` -> normal
- `!!` -> medium
- `!!!` -> high

Example:

```text
/ !! Finish API docs
```

Rendered (conceptual):

- `!` normal priority
- `!!` medium priority
- `!!!` high priority

## Due date and deadline tokens

Use ISO date format (`YYYY-MM-DD`) in task text.

- `>YYYY-MM-DD` = due date
- `>>YYYY-MM-DD` = deadline

Example:

```text
Prepare report >2026-03-15 >>2026-03-20
```

Rendered in note:

- The raw tokens are hidden in normal view.
- Localized date labels are shown inline instead:
  - `>2026-03-15` -> due date label
  - `>>2026-03-20` -> deadline label

## Migration

### In-editor migration

- Use `/migrate` (alias: `/move-task`) while the cursor is inside a task.
- This opens the migrate picker and moves/clones task content to another note.
- Source/target metadata is stored so the app can show `migrated to` / `migrated from`.

Example flow:

1. Cursor inside a task item
2. Run `/migrate`
3. Select target note
4. Source task is marked migrated, target receives cloned task

### Reindex command

If task index data gets out of sync, rebuild it:

```bash
php artisan notes:reindex-tasks
```

Optional queued mode:

```bash
php artisan notes:reindex-tasks --queued
```

## Notes

- Only `taskList > taskItem` entries are indexed as tasks.
- Child list content is stored separately in `children` and not merged into the parent task text.
- Checklist items are intentionally separate from indexed tasks.

## Related panel

The related panel in note view shows tasks connected to the current note.

- Sections:
  - Tasks
  - Backlinks
- Empty sections are hidden.
- If both are empty, the whole related panel is hidden.

Task behavior in panel:

- Default filter is **open tasks only**.
- Open = not checked, and status is not `canceled`/`migrated`.
- You can toggle to include closed items.
- Counter format is `closed_or_done/total`.
- Grouping is by source note.
- Toggling a task checkbox updates the task status directly from the panel.

### How tasks are considered related

Tasks are included in the related panel when one or more of these match:

1. Date relation
   - Due date token (`>YYYY-MM-DD`)
   - Deadline token (`>>YYYY-MM-DD`)
2. Wiki-link relation
   - A task contains a wiki-link to the current note.
3. Context relation
   - The note `context` property matches a mention token used in the task content.

This means a task can appear as related even when it lives in another note.

## Spellcheck (editor settings)

Spellcheck in the editor currently supports a per-note enable/disable toggle.

1. `spellcheck` property
   - `false`, `0`, `off`, `no` disables spellcheck for that note.
   - Any other value (or no value) keeps spellcheck enabled.
2. Browser requirement
   - The selected language dictionary must exist in your browser/OS spellchecker.
   - If a dictionary is missing, spellcheck may continue using another installed language.

Examples:

```text
spellcheck: true
```

```text
spellcheck: false
```
