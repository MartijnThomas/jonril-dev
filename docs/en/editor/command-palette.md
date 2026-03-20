# Command Palette

The command palette is the central launcher in Jonril for quick navigation and note actions.

## Open the palette

- Use `Cmd/Ctrl + K` to open the palette.
- Use `Cmd/Ctrl + Shift + K` to open directly in command mode (`:` prefilled).

## Recent

The **Recent** section helps you jump quickly to notes you opened before.

- It appears when you are not in command mode.
- It is optimized for fast keyboard navigation.
- Recent items include both regular notes and journal notes.

### Keyboard cycling

You can cycle recent items by opening the palette and navigating with arrow keys. The highlighted item can be opened with `Enter`.

## Search

Use search to find notes by typing in the palette input.

- Default mode searches notes.
- You can scope search using pills:
  - `Notes`
  - `Headings`
  - `Tasks`
  - `Journals`
- Use **More** to filter task statuses.
- Command mode is activated with `:`.

### Search behavior

- Typing normal text searches using the active pills/scopes.
- `# ` prefix mode is deprecated and no longer required for heading results.
- Typing `:` switches to command mode.

## Commands

Command mode is intended for actions, not note search.

- Start with `:` (for example `:rename New title`).
- Commands can have required arguments.
- Matching commands are shown live while typing.

### Currently available commands

- `:create` (alias: `:new`) — open the create-note dialog.
- `:rename <new title>` — rename the current note.
- `:move` (alias: `:mv`) — move the current regular note.
- `:erase` — erase the current note content and properties.
- `:delete` — soft delete the current regular note.

## Command availability

Not every command is available in every context.

### Global commands

These are available outside a note page (for example settings pages):

- `:create`
- `:new`

### Note-context commands

These require an open note:

- `:rename`
- `:move` / `:mv` (regular notes only)
- `:erase`
- `:delete` (regular notes only)

### Journal note limitations

On journal notes, destructive/structural options are limited compared to regular notes.

## Tips

- Use `Cmd/Ctrl + Shift + K` when you already know you want to run a command.
- Use normal `Cmd/Ctrl + K` when you want to navigate through recent notes first.
- If a command is context-dependent, open a note first and try again.
