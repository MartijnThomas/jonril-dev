# Block-tree editor

This document is the source of truth for the `block` editor architecture and current behavior.

## Architectural decision

`block` is a block editor, not a list-container editor.

Core principles:

1. The editable unit is a block (`heading` or `paragraph` node).
2. Paragraph variants are block-local styles, not different list nodes.
3. Indentation is stored on the current paragraph (`indent` attr).
4. Converting a block affects only that block, never siblings.
5. Legacy runtime compatibility is not a design constraint for block mode.

## Runtime boundaries

1. Workspace flag controls mode: `editor_mode = legacy | block`.
2. One editor shell is reused for both modes.
3. Block mode is a separate extension pack.
4. Bubble menu and mobile legacy toolbar are disabled in block mode.
5. Status bar shows `BLOCK MODE` when active.

## Data model (current)

### Nodes

1. `doc`
2. `heading`
3. `paragraph`

### Paragraph attrs

1. `indent: number`
2. `blockStyle: paragraph | bullet | ordered | quote | task`
3. `order: number` (for ordered style)
4. `checked: boolean` (task style)
5. `taskStatus: backlog | in_progress | canceled | null`
6. `dueDate: string | null` (`YYYY-MM-DD`)
7. `deadlineDate: string | null` (`YYYY-MM-DD`)
8. `startedAt: string | null`
9. `completedAt: string | null`
10. `backlogPromotedAt: string | null`

## Implemented behavior

### Headings

1. Toolbar supports `Paragraph`, `H1`-`H6`.
2. Headings use real editable `#` prefix text.
3. Prefix is hidden when heading is unfocused, shown when focused.
4. Editing `#` count changes level.
5. Removing heading prefix from active heading converts to paragraph.
6. Typing `# `, `## `, ..., `###### ` at paragraph start creates heading.

### Paragraph styles

1. `- ` creates bullet style paragraph.
2. `n. ` creates ordered style paragraph (`n` is any positive integer).
3. `> ` creates quote style paragraph.
4. `* ` creates task style paragraph.
5. Style buttons are toggleable:
   - click active style to unset back to `paragraph`
   - click different style to replace in place

### Indent / dedent

1. `Tab` increases paragraph `indent`.
2. `Shift-Tab` decreases paragraph `indent`.
3. `Backspace` at block start:
   - first removes block style marker (for styled paragraphs)
   - next dedents paragraph
4. Dedicated toolbar buttons exist for indent / dedent.

### Inline formatting

Block mode currently uses native TipTap marks for:

1. bold
2. italic
3. underline
4. strike
5. highlight
6. inline code

`Shift-Enter` inserts soft line breaks.

### Task status and click flow

Status prefixes are text tokens at task start:

1. `? ` = backlog
2. `/ ` = in progress
3. `- ` at start of an existing task = canceled

Prefix visibility:

1. visible/editable when task is focused
2. hidden when task is unfocused

Marker click behavior:

1. in progress -> checked (and remove `/ `)
2. checked -> open
3. open -> checked
4. backlog -> open (unchecked) and record pickup (remove `? `)

Timestamps:

1. `startedAt` when status becomes `in_progress`
2. `completedAt` when task becomes checked
3. `backlogPromotedAt` when backlog is picked up via click

### Task due/deadline

Task text supports:

1. `>YYYY-MM-DD` for due date
2. `>>YYYY-MM-DD` for deadline

Behavior:

1. Tokens are parsed from task text.
2. Parsed values sync into task attrs (`dueDate`, `deadlineDate`).
3. Raw token is shown when active.
4. Raw token is hidden when inactive and replaced by localized display token.

### Task priority

Task text supports priority markers at the start of task content:

1. `!` low
2. `!!` medium
3. `!!!` high

Allowed after status prefix:

1. `? ! ...`
2. `/ !! ...`

Behavior:

1. Priority token is hidden when task is unfocused and shown when focused.
2. Text after priority token is highlighted according to priority level.

### Mentions and hashtags (inline text)

1. Block mode recognizes inline `@mention` and `#hashtag` text anywhere in headings/paragraphs.
2. Inline styling is decoration-based (plain text remains plain text).
3. Autocomplete uses existing `workspaceSuggestions` payload from DB.
4. No new save flow was introduced for this step.

- TODO: Currently new mentions and hashtags are not preserved in the DB.

### Related tasks integration

The related tasks panel is fed by indexed task fragments and supports block-mode task metadata.

1. Due/deadline:
   - `>YYYY-MM-DD` and `>>YYYY-MM-DD` are indexed and exposed as `due_date_token` / `deadline_date_token` fragments.
   - These dates are available for related-task filtering and rendering.
2. Wiki-link:
   - Task content wiki-link marks are indexed as `wikilink` fragments (`note_id`, `href`, `text`).
   - Related-task matching can use these links when resolving note relationships.
3. Context:
   - Note `context` property is converted to normalized mention-style tokens.
   - Tasks containing matching mentions are included in related tasks for that note context.

## Migration and compatibility

1. Block mode accepts block documents only.
2. Legacy note JSON is not translated at runtime in block mode.
3. Future legacy -> block conversion is a separate migration/import concern.

## Known decisions

1. Keep native TipTap mark behavior for inline formatting for now.
2. Revisit markdown-visible mark tokens later if needed.
3. Keep block implementation split by domain files to avoid extension bloat.

## Next planned area

### Wiki-links in block mode

Accepted requirements:

CREATE A NEW BLOCK ONLY EXTENSION FOR THIS. NO REUSING OF OTHER ASPECTS.

1. Support both existing and non-existing targets at link creation time.
2. Persist non-existing targets as first-class link targets (do not discard unresolved paths).
3. Keep link metadata in sync once a previously non-existing target note is later created.
4. Re-open the picker when an existing wiki-link is edited (path and/or title edits).
5. Support custom link titles using `[[path/to/note|Custom Title]]`.
6. Edge deletion behavior should remove the whole wiki-link atomically.
7. Picker should include regular notes directly.
8. Picker should resolve journal notes progressively based on query input (__Please discuss this before implemenation__):
   - avoid preloading huge date ranges
   - narrow candidate generation by typed query (for example month/year fragments like `januari`)
   - avoid returning hundreds of journal candidates by default.

### Spellcheck
Implemented behavior:

1. Note property `spellcheck` can disable browser spellcheck (`false|0|off|no`).
2. Any other value (or missing property) keeps spellcheck enabled.
3. Per-note `language` override was removed after browser-level reliability issues.

### Allow pasting of content
Add the ability to paste content to the editor. For example I should be able to add this markdown file and it should render properly. And when I add a copied html it should work, the same for copied text-editor content.
