<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Str;

function focusBlockEditorAtDocumentEnd($page): void
{
    $page->script(<<<'JS'
(() => {
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return false;
    }

    editor.focus();
    const selection = window.getSelection();
    if (!selection) {
        return false;
    }

    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.addRange(range);

    return true;
})();
JS);
}

function currentBlockSnapshot($page): array
{
    $snapshot = $page->script(<<<'JS'
(() => {
    const selection = window.getSelection();
    const anchor = selection?.anchorNode ?? null;
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');

    if (!editor || !anchor) {
        return null;
    }

    const element =
        (anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentElement)?.closest(
            'p.bt-paragraph, h1.bt-heading, h2.bt-heading, h3.bt-heading, h4.bt-heading, h5.bt-heading, h6.bt-heading',
        ) ?? null;

    if (!element) {
        return null;
    }

    return {
        tag: element.tagName.toLowerCase(),
        blockStyle: element.getAttribute('data-block-style') ?? '',
        indent: Number(element.getAttribute('data-indent') ?? '0'),
        text: element.textContent ?? '',
    };
})();
JS);

    return is_array($snapshot) ? $snapshot : [];
}

function placeCursorAtStartOfCurrentParagraph($page): void
{
    $page->script(<<<'JS'
(() => {
    const selection = window.getSelection();
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!selection || !editor) {
        return false;
    }

    const anchor = selection.anchorNode;
    const paragraph =
        (anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement)?.closest(
            'p.bt-paragraph',
        ) ?? editor.querySelector('p.bt-paragraph:last-of-type');

    if (!paragraph) {
        return false;
    }

    const range = document.createRange();
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const firstTextNode = walker.nextNode();

    if (firstTextNode) {
        range.setStart(firstTextNode, 0);
        range.collapse(true);
    } else {
        range.selectNodeContents(paragraph);
        range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();

    return true;
})();
JS);
}

function placeCursorAtStartOfParagraphContaining($page, string $text): void
{
    $escapedText = json_encode($text, JSON_THROW_ON_ERROR);

    $page->script(<<<JS
(() => {
    const targetText = {$escapedText};
    const selection = window.getSelection();
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!selection || !editor) {
        return false;
    }

    const paragraph = Array.from(editor.querySelectorAll('p.bt-paragraph'))
        .find((node) => (node.textContent ?? '').includes(targetText));

    if (!paragraph) {
        return false;
    }

    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    const firstTextNode = walker.nextNode();
    const range = document.createRange();

    if (firstTextNode) {
        range.setStart(firstTextNode, 0);
        range.collapse(true);
    } else {
        range.selectNodeContents(paragraph);
        range.collapse(true);
    }

    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();

    return true;
})();
JS);
}

function paragraphSnapshotContaining($page, string $text): array
{
    $escapedText = json_encode($text, JSON_THROW_ON_ERROR);

    $snapshot = $page->script(<<<JS
(() => {
    const targetText = {$escapedText};
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return null;
    }

    const paragraph = Array.from(editor.querySelectorAll('p.bt-paragraph'))
        .find((node) => (node.textContent ?? '').includes(targetText));

    if (!paragraph) {
        return null;
    }

    return {
        blockStyle: paragraph.getAttribute('data-block-style') ?? '',
        indent: Number(paragraph.getAttribute('data-indent') ?? '0'),
        text: paragraph.textContent ?? '',
    };
})();
JS);

    return is_array($snapshot) ? $snapshot : [];
}

it('inserts a wiki-link from suggestions when pressing Enter', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $target = Note::factory()->for($workspace)->create([
        'title' => 'Target Wiki Link',
    ]);

    $source = Note::factory()->for($workspace)->create([
        'title' => 'Source Note',
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->assertNoJavaScriptErrors();

    focusBlockEditorAtDocumentEnd($page);

    $page->keys('.tiptap.ProseMirror.simple-editor', ['[', '[', 'T', 'a', 'r'])
        ->waitForText('Wiki links')
        ->assertSee('Target Wiki Link')
        ->keys('.tiptap.ProseMirror.simple-editor', 'Enter')
        ->waitForEvent('networkidle')
        ->assertNoJavaScriptErrors();

    $linkData = $page->script(<<<'JS'
(() => {
    const wiki = document.querySelector('.tiptap.ProseMirror.simple-editor [data-wikilink="true"]');
    if (!wiki) {
        return null;
    }

    const editorText = (document.querySelector('.tiptap.ProseMirror.simple-editor')?.textContent ?? '');

    return {
        text: wiki.textContent ?? '',
        noteId: wiki.getAttribute('data-note-id') ?? '',
        href: wiki.getAttribute('data-href') ?? '',
        targetPath: wiki.getAttribute('data-target-path') ?? '',
        hasRawBrackets: editorText.includes('[['),
    };
})();
JS);

    expect($linkData)->toBeArray();
    expect($linkData['text'] ?? '')->toContain('Target Wiki Link');
    expect($linkData['noteId'] ?? '')->toBe((string) $target->id);
    expect($linkData['hasRawBrackets'] ?? true)->toBeFalse();
});

it('inserts a journal period wiki-link using period token', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    Note::factory()->for($workspace)->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'April 2026',
        'journal_granularity' => Note::JOURNAL_MONTHLY,
        'journal_date' => '2026-04-01',
        'slug' => 'journal/monthly/2026-04',
    ]);

    $source = Note::factory()->for($workspace)->create([
        'title' => 'Journal Link Source',
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->assertNoJavaScriptErrors();

    focusBlockEditorAtDocumentEnd($page);

    $page->keys('.tiptap.ProseMirror.simple-editor', ['[', '[', '2', '0', '2', '6', '-', '0', '4'])
        ->waitForText('Wiki links')
        ->keys('.tiptap.ProseMirror.simple-editor', 'Enter')
        ->waitForEvent('networkidle')
        ->assertNoJavaScriptErrors();

    $linkData = $page->script(<<<'JS'
(() => {
    const wiki = document.querySelector('.tiptap.ProseMirror.simple-editor [data-wikilink="true"]');
    if (!wiki) {
        return null;
    }

    return {
        text: wiki.textContent ?? '',
        href: wiki.getAttribute('data-href') ?? '',
        targetPath: wiki.getAttribute('data-target-path') ?? '',
    };
})();
JS);

    expect($linkData)->toBeArray();
    expect($linkData['text'] ?? '')->toContain('2026-04');
    expect($linkData['targetPath'] ?? '')->toBe('journal/2026-04');
    expect($linkData['href'] ?? '')->toContain('/journal/2026-04');
});

it('keeps bullet formatting when inserting a wiki-link after dash-space', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $target = Note::factory()->for($workspace)->create([
        'title' => 'Zed Bullet Target',
    ]);

    $source = Note::factory()->for($workspace)->create([
        'title' => 'Bullet Source Note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => [
                        'level' => 1,
                        'id' => (string) Str::uuid(),
                    ],
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => 'Bullet Source Note',
                        ],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => (string) Str::uuid(),
                        'indent' => 0,
                        'blockStyle' => 'bullet',
                        'order' => 1,
                        'checked' => false,
                        'taskStatus' => null,
                    ],
                    'content' => [],
                ],
            ],
        ],
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->assertNoJavaScriptErrors();

    $initialHasBullet = $page->script(<<<'JS'
(() => Boolean(document.querySelector('.tiptap.ProseMirror.simple-editor p.bt-paragraph[data-block-style="bullet"]')) )();
JS);
    expect($initialHasBullet)->toBeTrue();

    focusBlockEditorAtDocumentEnd($page);

    $page->keys('.tiptap.ProseMirror.simple-editor', ['[', '[', 'Z', 'e', 'd'])
        ->waitForText('Wiki links')
        ->assertSee('Zed Bullet Target')
        ->keys('.tiptap.ProseMirror.simple-editor', 'Enter')
        ->waitForEvent('networkidle')
        ->assertNoJavaScriptErrors();

    $result = $page->script(<<<'JS'
(() => {
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return null;
    }

    const listItem = editor.querySelector('p.bt-paragraph[data-block-style="bullet"]');
    const wiki = listItem?.querySelector('[data-wikilink="true"]');
    const wikiText = wiki?.textContent ?? '';

    return {
        hasBullet: Boolean(listItem),
        hasWikiInBullet: Boolean(wiki),
        noteId: wiki?.getAttribute('data-note-id') ?? '',
        text: wikiText,
    };
})();
JS);

    expect($result)->toBeArray();
    expect($result['hasBullet'] ?? false)->toBeTrue();
    expect($result['hasWikiInBullet'] ?? false)->toBeTrue();
    expect($result['noteId'] ?? '')->toBe((string) $target->id);
    expect($result['text'] ?? '')->toContain('Zed Bullet Target');
});

it('supports quote block flow for indent enter enter text and backspace dedent', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $source = Note::factory()->for($workspace)->create([
        'title' => 'Quote Flow Source',
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->assertNoJavaScriptErrors();

    focusBlockEditorAtDocumentEnd($page);

    $page->keys('.tiptap.ProseMirror.simple-editor', [
        'Enter',
        '>',
        'Space',
        'Q',
        'u',
        'o',
        't',
        'e',
        ' ',
        'f',
        'l',
        'o',
        'w',
    ]);

    $step1 = currentBlockSnapshot($page);
    expect($step1['blockStyle'] ?? '')->toBe('quote');
    expect($step1['indent'] ?? -1)->toBe(0);
    expect($step1['text'] ?? '')->toContain('Quote flow');

    $page->keys('.tiptap.ProseMirror.simple-editor', 'Tab');
    $step2 = currentBlockSnapshot($page);
    expect($step2['blockStyle'] ?? '')->toBe('quote');
    expect($step2['indent'] ?? -1)->toBe(1);

    $page->keys('.tiptap.ProseMirror.simple-editor', 'Enter');
    $step3 = currentBlockSnapshot($page);
    expect($step3['blockStyle'] ?? '')->toBe('quote');
    expect($step3['indent'] ?? -1)->toBe(1);
    expect(trim((string) ($step3['text'] ?? '')))->toBe('');

    $page->keys('.tiptap.ProseMirror.simple-editor', 'Enter');
    $step4 = currentBlockSnapshot($page);
    expect($step4['blockStyle'] ?? '')->toBe('paragraph');
    expect($step4['indent'] ?? -1)->toBe(1);
    expect(trim((string) ($step4['text'] ?? '')))->toBe('');

    $page->keys('.tiptap.ProseMirror.simple-editor', ['N', 'e', 's', 't', 'e', 'd', ' ', 't', 'e', 'x', 't']);
    $step5 = paragraphSnapshotContaining($page, 'Nested text');
    expect($step5['blockStyle'] ?? '')->toBe('paragraph');
    expect($step5['indent'] ?? -1)->toBe(1);
    expect($step5['text'] ?? '')->toContain('Nested text');

    placeCursorAtStartOfParagraphContaining($page, 'Nested text');
    $page->keys('.tiptap.ProseMirror.simple-editor', 'Backspace');
    $page->wait(0.15);

    $step6 = paragraphSnapshotContaining($page, 'Nested text');
    expect($step6['blockStyle'] ?? '')->toBe('paragraph');
    expect($step6['indent'] ?? -1)->toBe(0);
    expect($step6['text'] ?? '')->toContain('Nested text');
});
