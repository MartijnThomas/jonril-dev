# Editor Slash Commands

This page documents the inline editor slash commands (typed with `/`) in Jonril.

## How slash commands work

1. Type `/` followed by a command name inside the editor.
2. Press `Enter` or `Tab` to execute.
3. If the typed command exactly matches, pressing `Space` also executes.

Example: `/task`, then `Enter`.

## Available commands

### `/task`

- Purpose: Toggle a task at the current line.
- Behavior:
  - If the cursor is already in a task item, it toggles checked/unchecked.
  - Otherwise, it converts/creates a task list item.
- Aliases:
  - `/todo`

### `/list`

- Purpose: Toggle a bullet list at the current line.
- Aliases:
  - `/bullet`

### `/quote`

- Purpose: Toggle a block quote.
- Aliases:
  - None

### `/code`

- Purpose: Toggle a code block.
- Aliases:
  - None

### `/h1`

- Purpose: Toggle heading level 1.
- Aliases:
  - None

### `/migrate`

- Purpose: Start task migration flow for the current task.
- Requirements:
  - Must be used while the cursor is inside a task item.
- Aliases:
  - `/move-task`

## Notes

- Slash commands are editor commands.
- Command palette commands (for example `:rename`) are documented separately.
