<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

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

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let lastTextNode = null;
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node && node.textContent !== null) {
            lastTextNode = node;
        }
    }

    if (lastTextNode) {
        selection.removeAllRanges();
        const range = document.createRange();
        range.setStart(lastTextNode, lastTextNode.textContent.length);
        range.collapse(true);
        selection.addRange(range);
        return true;
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
