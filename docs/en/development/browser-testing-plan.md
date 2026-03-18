# Browser Testing Plan

Updated: 2026-03-18

---

## Setup

Pest browser testing is configured and working. Infrastructure:

- **Package:** `pestphp/pest-plugin-browser` (Playwright-based, headless Chromium)
- **Tests location:** `tests/Browser/`
- **Suite name:** `Browser` (in `phpunit.xml`)
- **Screenshots:** `tests/Browser/Screenshots/` (`.png` files gitignored)
- **Pest.php:** `Browser` directory uses `RefreshDatabase` + `Tests\TestCase`

### Running browser tests

```bash
# Run only browser tests
php artisan test --testsuite=Browser

# Run all tests (unit + feature + browser)
php artisan test

# Run headed (opens real browser window) — useful for debugging
./vendor/bin/pest --headed --testsuite=Browser

# Pause on failure and open browser
./vendor/bin/pest --debug --testsuite=Browser
```

### Keeping browser tests separate from CI fast path

Browser tests are slower (~2–5s per test). The recommended approach is to keep them in a separate CI job that runs in parallel with (not blocking) the fast unit/feature suite.

---

## Why browser tests matter for this app

The frontend is a TipTap-based React SPA rendered via Inertia. Most critical behaviors are **client-side only** and cannot be tested by Laravel's HTTP test client:

- TipTap editor rendering, keyboard shortcuts, block styles
- Suggestion menus (`[[`, `@`, `#`) appearing and filtering correctly
- Task checkbox and status marker clicks
- Sidebar navigation, note tree, deferred panel loading
- Autosave (the `sarth:note-saved` event, debounce, error states)
- Inertia page transitions (no full page reload)

These are the areas where bugs are most likely to go undetected by existing feature tests.

---

## Priority tiers

### Tier 1 — Core flows (implement first)

These cover the most critical paths a user takes every session. A regression here means the app is broken for everyone.

#### 1.1 Authentication

**File:** `tests/Browser/Auth/LoginTest.php`

| Test | What to verify |
|---|---|
| Login page renders | `assertSee('Log in')`, `assertNoJavaScriptErrors()` |
| Valid credentials log in | Fills form, submits, `assertAuthenticated()`, redirected to notes |
| Invalid credentials show error | `assertSee('These credentials do not match')` |
| Redirect after login | Visiting `/notes` while logged out → after login lands on `/notes` |

```php
it('can log in with valid credentials', function () {
    $user = User::factory()->create(['password' => bcrypt('password')]);

    visit('/login')
        ->fill('email', $user->email)
        ->fill('password', 'password')
        ->press('Log in')
        ->assertNoJavaScriptErrors();

    $this->assertAuthenticated();
});
```

#### 1.2 Note creation and navigation

**File:** `tests/Browser/Notes/NoteCreationTest.php`

| Test | What to verify |
|---|---|
| Create note lands on editor | `POST /notes` → redirected to note URL, editor renders |
| Note title is shown in breadcrumb | After creation, breadcrumb includes note title |
| Sidebar shows new note in tree | Note appears in left sidebar notes tree |
| Navigating between notes | Clicking a note in the sidebar loads it without full page reload |

#### 1.3 Block editor — basic editing

**File:** `tests/Browser/Editor/BlockEditorBasicTest.php`

This is the highest-value category. The editor is almost entirely client-side.

| Test | What to verify |
|---|---|
| Editor renders without JS errors | `assertNoJavaScriptErrors()` after note opens |
| Typing in editor persists content | Type text, wait for autosave, reload, `assertSee(text)` |
| Creating a heading with `# ` | Type `# My heading`, verify heading is rendered |
| Creating a bullet with `- ` | Type `- item`, verify bullet style applied |
| Creating a task with `* ` | Type `* do this`, verify task checkbox appears |
| Bold shortcut `⌘B` | Select text, `keys('Meta+b')`, verify bold mark applied |
| Enter creates new block | Press Enter, verify cursor moves to new block |

```php
it('typing in the block editor persists after autosave', function () {
    $user = User::factory()->create();
    $note = $user->currentWorkspace()->notes()->create([...]);

    $page = visit(note_url($note))->actingAs($user);

    $page->click('.tiptap') // focus editor
        ->type('.tiptap', 'Hello world')
        ->wait(2000) // wait for autosave debounce
        ->assertNoJavaScriptErrors();

    // Reload and verify content persisted
    $page->navigate(note_url($note))
        ->assertSee('Hello world');
});
```

#### 1.4 Task toggle

**File:** `tests/Browser/Editor/TaskToggleTest.php`

| Test | What to verify |
|---|---|
| Clicking task marker toggles checked state | `click('.task-marker')`, verify checked class |
| Checked task shows strikethrough styling | Task text has completed visual |
| Read-only (migrated) note cannot toggle tasks | Marker click has no effect |

---

### Tier 2 — Key interactive features

Implement after Tier 1 is stable.

#### 2.1 Wiki-link suggestion menu

**File:** `tests/Browser/Editor/WikiLinkSuggestionTest.php`

| Test | What to verify |
|---|---|
| Typing `[[` opens suggestion menu | Menu appears after `[[` |
| Typing filters suggestions | Menu filters by note title |
| Pressing Enter inserts wiki-link | Link text inserted, menu closes |
| Pressing Escape closes menu | Menu disappears |
| No JS errors during typing | `assertNoJavaScriptErrors()` |

This directly covers the infinite-loop bugs fixed in March 2026.

#### 2.2 Mention/hashtag suggestion menu

**File:** `tests/Browser/Editor/TokenSuggestionTest.php`

| Test | What to verify |
|---|---|
| Typing `@` opens mention suggestions | Menu appears |
| Typing `#` opens hashtag suggestions | Menu appears |
| Selecting inserts token | Token inserted with trailing space |
| Escape closes without inserting | Menu disappears, cursor stays |

#### 2.3 Deferred panel loading

**File:** `tests/Browser/Notes/RelatedPanelTest.php`

| Test | What to verify |
|---|---|
| Related tasks panel loads after initial render | Skeleton shown first, then tasks appear |
| Backlinks panel loads after initial render | Skeleton shown first, then backlinks appear |
| No JS errors during deferred load | `assertNoJavaScriptErrors()` after wait |

This tests the `related-panel` Inertia deferred group.

#### 2.4 Journal navigation

**File:** `tests/Browser/Journal/JournalNavigationTest.php`

| Test | What to verify |
|---|---|
| Journal landing redirects to today | URL contains today's date |
| Previous/next day navigation | Clicking nav buttons changes the date in URL |
| Journal note editor renders | No JS errors |

---

### Tier 3 — Smoke tests and regression guards

Run on every deploy. These are fast, broad checks that nothing is obviously broken.

#### 3.1 Page smoke test

**File:** `tests/Browser/SmokeTest.php` _(exists)_

Extend with:

```php
it('key authenticated pages render without javascript errors', function () {
    $user = User::factory()->create();
    $note = createNoteForUser($user);

    $this->actingAs($user);

    $pages = visit([
        '/',
        '/login',
        '/notes/list',
        note_url($note),
    ]);

    $pages->assertNoJavaScriptErrors()
        ->assertNoConsoleLogs();
});
```

#### 3.2 Visual regression baselines

**File:** `tests/Browser/VisualRegressionTest.php`

Run after confirming UI is correct. Screenshots are stored as baselines; future runs compare against them.

```php
it('note editor matches visual baseline', function () {
    $user = User::factory()->create();
    $note = createNoteForUser($user, content: [...]);

    $page = visit(note_url($note));

    $page->assertScreenshotMatches();
});
```

> Start visual regression only after Tier 1 and 2 are stable — baseline churn during active development is noisy.

---

## Test helper conventions

Add shared helpers to `tests/Browser/Support/helpers.php` (or inline in `Pest.php` `Browser` block):

```php
// Create a note for a user and return its URL
function browser_note_url(User $user, array $attrs = []): string
{
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create(array_merge([
        'type' => 'note',
        'title' => 'Test note',
    ], $attrs));

    // Force slug generation
    app(\App\Services\NoteSlugService::class)->syncSingleNote($note);
    $note->refresh();

    return "/w/{$workspace->slug}/notes/{$note->slug}";
}
```

## Things to watch out for

| Pitfall | Mitigation |
|---|---|
| Autosave debounce (750ms) | `->wait(1500)` before asserting saved content |
| Inertia page transitions are async | Use `->assertPathIs(...)` after navigation instead of asserting immediately |
| Deferred props arrive after render | Add `->wait(1000)` or wait for a specific element before asserting deferred content |
| Editor focus required before typing | `->click('.tiptap')` before `->type(...)` |
| `assertNoJavaScriptErrors()` catches console errors too | Keep it in every test as a baseline check |
| Block editor uses `contenteditable` | Use `->type('.tiptap', text)` not `->fill(...)` |

## Implementation order

1. ~~**Setup** — Install plugin, configure suite~~ ✓ Done (`tests/Browser/SmokeTest.php`)
2. **Tier 1.1** — Auth tests (`LoginTest.php`)
3. **Tier 1.2** — Note creation + navigation
4. **Tier 1.3** — Block editor basic editing (highest value)
5. **Tier 1.4** — Task toggle
6. **Tier 2.1** — Wiki-link suggestion menu (directly guards against the March 2026 infinite-loop regression)
7. **Tier 2.2** — Token suggestion menus (`@`, `#`)
8. **Tier 2.3** — Deferred panel loading
9. **Tier 3.1** — Extended smoke tests
10. **Tier 3.2** — Visual regression baselines (last — only when UI is stable)
