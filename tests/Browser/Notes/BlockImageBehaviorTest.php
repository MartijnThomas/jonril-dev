<?php

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Str;

it('inserts an image upload placeholder via block toolbar without breaking surrounding layout', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $source = Note::factory()->for($workspace)->create([
        'title' => 'Image Upload Source',
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
                            'text' => 'Image Upload Source',
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
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => 'Bullet before image',
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->assertNoJavaScriptErrors();

    $page->script(<<<'JS'
(() => {
    window.__blockNoteImageUploadTestStub = async () => {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ8lQ3kAAAAASUVORK5CYII=';
    };
})();
JS);

    $page->click('[aria-label="Insert image"]')
        ->assertPresent('.tiptap-image-upload input[name="file"]');

    $page->waitForEvent('networkidle')
        ->wait(0.5)
        ->assertNoJavaScriptErrors();

    $beforeReload = $page->script(<<<'JS'
(() => {
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return null;
    }

    const bullet = editor.querySelector('p.bt-paragraph[data-block-style="bullet"]');
    const uploadNode = editor.querySelector('.tiptap-image-upload');

    return {
        hasUploadNode: Boolean(uploadNode),
        uploadText: uploadNode?.textContent ?? '',
        hasBullet: Boolean(bullet),
        bulletText: bullet?.textContent ?? '',
    };
})();
JS);

    expect($beforeReload)->toBeArray();
    expect($beforeReload['hasUploadNode'] ?? false)->toBeTrue();
    expect($beforeReload['hasBullet'] ?? false)->toBeTrue();
    expect($beforeReload['bulletText'] ?? '')->toContain('Bullet before image');

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->waitForEvent('networkidle')
        ->assertNoJavaScriptErrors();

    $afterReload = $page->script(<<<'JS'
(() => {
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return null;
    }

    const bullet = editor.querySelector('p.bt-paragraph[data-block-style="bullet"]');
    const uploadNode = editor.querySelector('.tiptap-image-upload');

    return {
        hasUploadNode: Boolean(uploadNode),
        hasBullet: Boolean(bullet),
        bulletText: bullet?.textContent ?? '',
    };
})();
JS);

    expect($afterReload)->toBeArray();
    expect($afterReload['hasUploadNode'] ?? true)->toBeFalse();
    expect($afterReload['hasBullet'] ?? false)->toBeTrue();
    expect($afterReload['bulletText'] ?? '')->toContain('Bullet before image');
});

it('inserts a base64 data image via deterministic test hook', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $source = Note::factory()->for($workspace)->create([
        'title' => 'Base64 Paste Source',
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
                            'text' => 'Base64 Paste Source',
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
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => 'Bullet before paste',
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->assertNoJavaScriptErrors();

    $page->script(<<<'JS'
(() => {
    window.__blockNoteImageUploadTestStub = async () => {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ8lQ3kAAAAASUVORK5CYII=';
    };
})();
JS);

    $pasteTriggered = $page->script(<<<'JS'
async () => {
    if (typeof window.__blockNoteImageInsertDataUrlForTest !== 'function') {
        return false;
    }

    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!(editor instanceof HTMLElement)) {
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

    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ8lQ3kAAAAASUVORK5CYII=';
    return await window.__blockNoteImageInsertDataUrlForTest(dataUrl);
}
JS);
    expect($pasteTriggered)->toBeTrue();

    $page->waitForEvent('networkidle')
        ->wait(1.0)
        ->assertNoJavaScriptErrors();

    $beforeReload = $page->script(<<<'JS'
(() => {
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return null;
    }

    const image = editor.querySelector('img');
    const bullet = editor.querySelector('p.bt-paragraph[data-block-style="bullet"]');

    return {
        hasImage: Boolean(image),
        imageSrc: image?.getAttribute('src') ?? '',
        hasBullet: Boolean(bullet),
        bulletText: bullet?.textContent ?? '',
    };
})();
JS);

    expect($beforeReload)->toBeArray();
    expect($beforeReload['hasImage'] ?? false)->toBeTrue();
    expect($beforeReload['imageSrc'] ?? '')->toContain('data:image/png;base64,');
    expect($beforeReload['hasBullet'] ?? false)->toBeTrue();
    expect($beforeReload['bulletText'] ?? '')->toContain('Bullet before paste');

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->waitForEvent('networkidle')
        ->assertNoJavaScriptErrors();
});

it('uploads and persists a base64 data image via real backend handler', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    $workspace = $user->currentWorkspace();
    expect($workspace)->toBeInstanceOf(Workspace::class);

    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $source = Note::factory()->for($workspace)->create([
        'title' => 'Real Upload Source',
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
                            'text' => 'Real Upload Source',
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
                    'content' => [
                        [
                            'type' => 'text',
                            'text' => 'Bullet before real upload',
                        ],
                    ],
                ],
            ],
        ],
    ]);

    $page = browserLogin($user);

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->assertNoJavaScriptErrors();

    $page->script(<<<'JS'
(() => {
    if (typeof window.__blockNoteImageUploadTestStub !== 'undefined') {
        delete window.__blockNoteImageUploadTestStub;
    }
})();
JS);

    $uploaded = $page->script(<<<'JS'
async () => {
    if (typeof window.__blockNoteImageInsertDataUrlForTest !== 'function') {
        return false;
    }

    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!(editor instanceof HTMLElement)) {
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

    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBgJ8lQ3kAAAAASUVORK5CYII=';
    return await window.__blockNoteImageInsertDataUrlForTest(dataUrl);
}
JS);
    expect($uploaded)->toBeTrue();

    $page->waitForEvent('networkidle')
        ->wait(1.2)
        ->assertNoJavaScriptErrors();

    $beforeReload = $page->script(<<<'JS'
(() => {
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return null;
    }

    const image = editor.querySelector('img');
    const bullet = editor.querySelector('p.bt-paragraph[data-block-style="bullet"]');

    return {
        hasImage: Boolean(image),
        imageSrc: image?.getAttribute('src') ?? '',
        hasBullet: Boolean(bullet),
        bulletText: bullet?.textContent ?? '',
    };
})();
JS);

    expect($beforeReload)->toBeArray();
    expect($beforeReload['hasImage'] ?? false)->toBeTrue();
    expect($beforeReload['imageSrc'] ?? '')->toContain('/w/');
    expect($beforeReload['hasBullet'] ?? false)->toBeTrue();
    expect($beforeReload['bulletText'] ?? '')->toContain('Bullet before real upload');

    $page->navigate(browserScopedNoteUrl($source))
        ->assertPathIs(browserScopedNoteUrl($source))
        ->waitForEvent('networkidle')
        ->assertNoJavaScriptErrors();

    $afterReload = $page->script(<<<'JS'
(() => {
    const editor = document.querySelector('.tiptap.ProseMirror.simple-editor');
    if (!editor) {
        return null;
    }

    const image = editor.querySelector('img');
    return {
        hasImage: Boolean(image),
        imageSrc: image?.getAttribute('src') ?? '',
    };
})();
JS);

    expect($afterReload)->toBeArray();
    expect($afterReload['hasImage'] ?? false)->toBeTrue();
    expect($afterReload['imageSrc'] ?? '')->toContain('/w/');
})->skip('Pending stable browser environment for authenticated upload requests');
