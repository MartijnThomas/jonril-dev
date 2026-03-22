<?php

use App\Models\Calendar;
use App\Models\Event;
use App\Models\Note;
use App\Models\NoteRevision;
use App\Models\NoteTask;
use App\Models\Timeblock;
use App\Models\TimeblockCalendarLink;
use App\Models\User;
use App\Models\Workspace;
use Illuminate\Support\Carbon;
use Inertia\Testing\AssertableInertia as Assert;

function scoped_note_url($workspace, string $note): string
{
    return "/w/{$workspace?->slug}/notes/{$note}";
}

function scoped_journal_url($workspace, string $granularity, string $period): string
{
    return "/journal/{$period}";
}

test('start creates a note for the authenticated user and redirects to it', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $this->actingAs($user);

    $response = $this->get(route('notes.start'));

    $note = Note::query()->where('workspace_id', $workspace?->id)->first();

    expect($note)->not()->toBeNull();
    expect($note->slug)->not()->toBeNull();
    $response->assertRedirect(scoped_note_url($workspace, $note->id));
});

test('start initializes block mode notes with an h1 first block', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'editor_mode' => 'block',
    ])->save();

    $this->actingAs($user)->get(route('notes.start'));

    $note = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->latest('created_at')
        ->first();

    expect($note)->not()->toBeNull();
    expect(data_get($note->content, 'content.0.type'))->toBe('heading');
    expect((int) data_get($note->content, 'content.0.attrs.level'))->toBe(1);
});

test('migrated source workspace is read-only in notes UI and update endpoint', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'migrated_at' => now(),
    ])->save();

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Read only note',
        'slug' => 'read-only-note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [['type' => 'text', 'text' => 'Read only note']],
                ],
            ],
        ],
    ]);

    $this->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id))
        ->assertInertia(fn (Assert $page) => $page
            ->where('editorReadOnly', true)
            ->where('noteUpdateUrl', '')
            ->where('noteActions.canClear', false)
            ->where('noteActions.canRename', false)
            ->where('noteActions.canMove', false)
            ->where('noteActions.canDelete', false),
        );

    $this->actingAs($user)
        ->putJson(scoped_note_url($workspace, $note->id), [
            'content' => [
                'type' => 'doc',
                'content' => [
                    [
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Attempt write']],
                    ],
                ],
            ],
        ])
        ->assertStatus(409);
});

test('show resolves notes by slug', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $user->notes()->create([
        'type' => 'note',
        'title' => 'My Project Note',
        'slug' => 'my-project-note',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/my-project-note')
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $note->id)
            ->where('noteUpdateUrl', scoped_note_url($workspace, $note->id)),
        );
});

test('show includes linkable note headings metadata for wiki-link heading suggestions', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $target = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target',
        'slug' => 'target',
    ]);
    Note::query()->where('id', $target->id)->update([
        'meta' => [
            'navigation' => [
                [
                    'type' => 'heading',
                    'html_id' => 'h-1',
                    'level' => 1,
                    'text' => 'First heading',
                ],
            ],
        ],
    ]);

    $viewer = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Viewer',
        'slug' => 'viewer',
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $viewer->id))
        ->assertInertia(fn (Assert $page) => $page
            ->where('linkableNotes', function ($linkableNotes) use ($target): bool {
                $match = collect($linkableNotes)->first(
                    fn (array $item) => ($item['id'] ?? null) === $target->id,
                );
                if (! is_array($match)) {
                    return false;
                }

                return ($match['headings'] ?? null) === [[
                    'id' => 'h-1',
                    'title' => 'First heading',
                    'level' => 1,
                ]];
            }),
        );
});

test('journal page linkable notes include member workspaces and exclude non-member workspaces', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $sharedWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
        'name' => 'Shared Team',
    ]);

    $memberNote = $sharedWorkspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Shared Target',
    ]);

    $migratedWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
        'name' => 'Migrated Source',
        'migrated_at' => now(),
    ]);

    $migratedNote = $migratedWorkspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Migrated Target',
    ]);

    $outsiderUser = User::factory()->create();
    $outsiderWorkspace = $outsiderUser->currentWorkspace();
    $outsiderNote = $outsiderWorkspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Outsider Target',
    ]);

    $personalWorkspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Friday 7 March 2026',
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('linkableNotes', function ($linkableNotes) use ($memberNote, $outsiderNote, $migratedNote): bool {
                $items = collect($linkableNotes);
                $member = $items->first(fn (array $item) => ($item['id'] ?? null) === $memberNote->id);
                if (! is_array($member)) {
                    return false;
                }

                if (($member['workspaceName'] ?? null) !== 'Shared Team') {
                    return false;
                }

                if (($member['isCrossWorkspace'] ?? null) !== true) {
                    return false;
                }

                return $items->every(fn (array $item) => ! in_array(
                    (string) ($item['id'] ?? ''),
                    [$outsiderNote->id, $migratedNote->id],
                    true,
                ));
            }),
        );
});

test('regular note linkable notes remain scoped to active workspace', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $localSource = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Local Source',
    ]);

    $sharedWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
        'name' => 'Shared Team',
    ]);

    $sharedNote = $sharedWorkspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Shared Target',
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $localSource->id))
        ->assertInertia(fn (Assert $page) => $page
            ->where('linkableNotes', function ($linkableNotes) use ($sharedNote): bool {
                return collect($linkableNotes)->every(
                    fn (array $item) => ($item['id'] ?? null) !== $sharedNote->id,
                );
            }),
        );
});

test('show includes the workspace editor mode', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'editor_mode' => 'block',
    ])->save();

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Editor mode note',
        'slug' => 'editor-mode-note',
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id))
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/show')
            ->where('noteId', $note->id)
            ->where('editorMode', 'block'),
        );
});

test('legacy admin sees block preview toggle in note actions', function () {
    $user = User::factory()->create([
        'role' => 'admin',
    ]);
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_LEGACY,
    ])->save();

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Preview toggle note',
        'slug' => 'preview-toggle-note',
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id))
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteActions.canOpenBlockPreview', true)
            ->where(
                'noteActions.blockPreviewUrl',
                scoped_note_url($workspace, $note->id).'?preview_block=1',
            ),
        );
});

test('legacy non-admin does not see block preview toggle in note actions', function () {
    $user = User::factory()->create([
        'role' => 'user',
    ]);
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_LEGACY,
    ])->save();

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'No preview toggle note',
        'slug' => 'no-preview-toggle-note',
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id))
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteActions.canOpenBlockPreview', false)
            ->where('noteActions.blockPreviewUrl', null),
        );
});

test('block workspace renders legacy-shaped note content as block content without mutating note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $legacyContent = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => '# Legacy title'],
                ],
            ],
            [
                'type' => 'bulletList',
                'content' => [
                    [
                        'type' => 'listItem',
                        'content' => [
                            [
                                'type' => 'paragraph',
                                'content' => [
                                    ['type' => 'text', 'text' => 'Item'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ];

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Legacy title',
        'slug' => 'legacy-title',
        'content' => $legacyContent,
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id))
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/show')
            ->where('editorMode', Workspace::EDITOR_MODE_BLOCK)
            ->where('editorReadOnly', false)
            ->where('content.type', 'doc')
            ->where('content.content.0.type', 'heading')
            ->where('content.content.0.attrs.level', 1)
            ->where('content.content.0.content.0.text', 'Legacy title')
            ->where('content.content.1.type', 'paragraph')
            ->where('content.content.1.attrs.blockStyle', 'bullet')
            ->where('content.content.1.content.0.text', 'Item'),
        );

    $note->refresh();
    expect($note->content)->toBe($legacyContent);
});

test('legacy workspace supports read-only block preview without mutating note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $workspace?->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_LEGACY,
    ])->save();

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Legacy preview title',
        'slug' => 'legacy-preview-title',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => '# Legacy preview title'],
                    ],
                ],
            ],
        ],
    ]);

    $originalContent = $note->content;
    $originalTitle = $note->title;
    $originalSlug = $note->slug;

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id).'?preview_block=1')
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/show')
            ->where('editorMode', Workspace::EDITOR_MODE_BLOCK)
            ->where('editorReadOnly', true)
            ->where('noteUpdateUrl', '')
            ->where('content.type', 'doc')
            ->where('content.content.0.type', 'heading')
            ->where('content.content.0.attrs.level', 1)
            ->where('content.content.0.content.0.text', 'Legacy preview title'),
        );

    $note->refresh();

    expect($note->content)->toBe($originalContent);
    expect($note->title)->toBe($originalTitle);
    expect($note->slug)->toBe($originalSlug);
});

test('preview block mode rejects note updates and does not mutate stored content', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Preview protected note',
        'slug' => 'preview-protected-note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Original body'],
                    ],
                ],
            ],
        ],
    ]);

    $originalContent = $note->content;
    $originalTitle = $note->title;

    $this
        ->actingAs($user)
        ->putJson(route('notes.update', [
            'workspace' => $workspace->slug,
            'note' => $note->id,
        ]).'?preview_block=1', [
            'content' => [
                'type' => 'doc',
                'content' => [
                    [
                        'type' => 'heading',
                        'attrs' => ['level' => 1],
                        'content' => [
                            ['type' => 'text', 'text' => 'Mutated'],
                        ],
                    ],
                ],
            ],
            'properties' => [],
            'save_mode' => 'manual',
        ])
        ->assertStatus(409);

    $note->refresh();

    expect($note->content)->toBe($originalContent);
    expect($note->title)->toBe($originalTitle);
});

test('show includes the user language for the editor', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);
    $workspace = $user->currentWorkspace();

    $note = $workspace?->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Language note',
        'slug' => 'language-note',
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id))
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/show')
            ->where('language', 'en'),
        );
});

test('show includes timeblock sync status per block id for selected outbound calendar', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $calendar = Calendar::query()->create([
        'workspace_id' => $workspace->id,
        'name' => 'Primary',
        'provider' => 'caldav',
        'url' => 'https://caldav.example.com/user/primary/',
        'username' => 'user@example.com',
        'password' => 'secret',
        'is_active' => true,
    ]);

    $settings = is_array($user->settings) ? $user->settings : [];
    data_set($settings, 'calendar.outbound_timeblock_calendar_id', $calendar->id);
    $user->forceFill(['settings' => $settings])->save();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Daily',
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-21',
        'slug' => 'journal/daily/2026-03-21',
    ]);

    $pendingBlockId = (string) str()->uuid();
    $failedBlockId = (string) str()->uuid();
    $syncedBlockId = (string) str()->uuid();

    $pendingTimeblock = Timeblock::query()->create([]);
    $failedTimeblock = Timeblock::query()->create([]);
    $syncedTimeblock = Timeblock::query()->create([]);

    $pendingEvent = Event::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => $pendingBlockId,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $pendingTimeblock->id,
        'title' => 'Pending',
        'starts_at' => '2026-03-21 09:00:00',
        'ends_at' => '2026-03-21 10:00:00',
        'timezone' => 'UTC',
    ]);

    $failedEvent = Event::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => $failedBlockId,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $failedTimeblock->id,
        'title' => 'Failed',
        'starts_at' => '2026-03-21 10:00:00',
        'ends_at' => '2026-03-21 11:00:00',
        'timezone' => 'UTC',
    ]);

    $syncedEvent = Event::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => $syncedBlockId,
        'eventable_type' => Timeblock::class,
        'eventable_id' => $syncedTimeblock->id,
        'title' => 'Synced',
        'starts_at' => '2026-03-21 11:00:00',
        'ends_at' => '2026-03-21 12:00:00',
        'timezone' => 'UTC',
    ]);

    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => $note->id,
        'event_id' => $pendingEvent->id,
        'timeblock_id' => $pendingTimeblock->id,
        'sync_status' => TimeblockCalendarLink::STATUS_PENDING_UPDATE,
    ]);

    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => $note->id,
        'event_id' => $failedEvent->id,
        'timeblock_id' => $failedTimeblock->id,
        'sync_status' => TimeblockCalendarLink::STATUS_FAILED,
    ]);

    TimeblockCalendarLink::query()->create([
        'workspace_id' => $workspace->id,
        'calendar_id' => $calendar->id,
        'note_id' => $note->id,
        'event_id' => $syncedEvent->id,
        'timeblock_id' => $syncedTimeblock->id,
        'sync_status' => TimeblockCalendarLink::STATUS_SYNCED,
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $note->id))
        ->assertInertia(fn (Assert $page) => $page
            ->where("timeblockSyncByBlockId.{$pendingBlockId}", 'pending')
            ->where("timeblockSyncByBlockId.{$failedBlockId}", 'failed')
            ->where('timeblockSyncByBlockId', fn ($map) => ! collect($map)->contains('synced')),
        );
});

test('rename updates db title and rebuilds parent and child slugs', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project',
        'slug' => 'project',
        'properties' => [
            'title' => 'Display title should not change slug',
        ],
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child note',
        'slug' => 'project/child-note',
        'parent_id' => $parent->id,
    ]);

    $response = $this
        ->actingAs($user)
        ->patch("/notes/{$parent->id}/rename", [
            'title' => 'Project X',
        ]);

    $response->assertRedirect(scoped_note_url($workspace, $parent->id));

    $parent->refresh();
    $child->refresh();

    expect($parent->getRawOriginal('title'))->toBe('Project X');
    expect($parent->slug)->toBe('project-x');
    expect($child->slug)->toBe('project-x/child-note');
    expect(data_get($parent->properties, 'title'))->toBe('Display title should not change slug');
});

test('rename also updates first heading level one when present', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Original',
        'slug' => 'original',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [
                        ['type' => 'text', 'text' => 'Original'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Body'],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/rename", [
            'title' => 'Renamed',
        ])
        ->assertRedirect(scoped_note_url($workspace, $note->id));

    $note->refresh();
    expect(data_get($note->content, 'content.0.content.0.text'))->toBe('Renamed');
});

test('rename does not modify content when no heading level one exists', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $originalContent = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'No heading'],
                ],
            ],
        ],
    ];

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Original',
        'slug' => 'original-2',
        'content' => $originalContent,
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/rename", [
            'title' => 'Renamed no h1',
        ])
        ->assertRedirect(scoped_note_url($workspace, $note->id));

    $note->refresh();
    expect($note->content)->toBe($originalContent);
});

test('move updates parent and rebuilds slug for note and descendants', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $rootA = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root A',
        'slug' => 'root-a',
    ]);
    $rootB = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root B',
        'slug' => 'root-b',
    ]);
    $moving = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Moving',
        'slug' => 'root-a/moving',
        'parent_id' => $rootA->id,
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'slug' => 'root-a/moving/child',
        'parent_id' => $moving->id,
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$moving->id}/move", [
            'parent_id' => $rootB->id,
        ])
        ->assertRedirect(scoped_note_url($workspace, $moving->id));

    $moving->refresh();
    $child->refresh();

    expect($moving->parent_id)->toBe($rootB->id);
    expect($moving->slug)->toBe('root-b/moving');
    expect($child->slug)->toBe('root-b/moving/child');
});

test('move supports moving a note to root', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Parent',
        'slug' => 'parent',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'slug' => 'parent/child',
        'parent_id' => $parent->id,
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$child->id}/move", [
            'parent_id' => null,
        ])
        ->assertRedirect(scoped_note_url($workspace, $child->id));

    $child->refresh();
    expect($child->parent_id)->toBeNull();
    expect($child->slug)->toBe('child');
});

test('move rejects moving under descendant', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root',
        'slug' => 'root',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'slug' => 'root/child',
        'parent_id' => $root->id,
    ]);

    $this
        ->actingAs($user)
        ->from("/notes/{$root->slug}")
        ->patch("/notes/{$root->id}/move", [
            'parent_id' => $child->id,
        ])
        ->assertSessionHasErrors('parent_id');
});

test('destroy soft deletes note and redirects to notes list', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Delete me',
        'slug' => 'delete-me',
    ]);

    $this
        ->actingAs($user)
        ->delete("/notes/{$note->id}")
        ->assertRedirect('/notes/list');

    $this->assertSoftDeleted('notes', [
        'id' => $note->id,
    ]);
});

test('clear removes content and properties for regular note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Clear me',
        'slug' => 'clear-me',
        'content' => [
            'type' => 'doc',
            'content' => [
                ['type' => 'heading', 'attrs' => ['level' => 1], 'content' => [['type' => 'text', 'text' => 'Clear me']]],
                ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Some body']]],
            ],
        ],
        'properties' => [
            'context' => 'acme',
            'tags' => ['one', 'two'],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/clear")
        ->assertStatus(302);

    $note->refresh();

    expect($note->content)->toBe([
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Clear me'],
                ],
            ],
        ],
    ]);
    expect($note->properties)->toBe([]);
    expect($note->getRawOriginal('title'))->toBe('Clear me');
});

test('clear removes content and properties for journal note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-08',
        'title' => 'Custom journal title',
        'slug' => 'journal/daily/2026-03-08',
        'content' => [
            'type' => 'doc',
            'content' => [
                ['type' => 'paragraph', 'content' => [['type' => 'text', 'text' => 'Daily text']]],
            ],
        ],
        'properties' => [
            'tags' => ['daily'],
        ],
    ]);

    $this
        ->actingAs($user)
        ->patch("/notes/{$note->id}/clear")
        ->assertStatus(302);

    $note->refresh();

    expect($note->content)->toBe([
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Custom journal title'],
                ],
            ],
        ],
    ]);
    expect($note->properties)->toBe([]);
    expect($note->getRawOriginal('title'))->toBe('Custom journal title');
});

test('soft deleted notes are not resolved by slug and can be restored', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Soft delete test',
        'slug' => 'soft-delete-test',
    ]);

    $note->delete();

    $this->assertSoftDeleted('notes', [
        'id' => $note->id,
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/soft-delete-test')
        ->assertNotFound();

    $note->restore();

    $this
        ->actingAs($user)
        ->get('/notes/soft-delete-test')
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $note->id),
        );
});

test('deleting a note soft deletes all descendants recursively', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root',
        'slug' => 'root',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'slug' => 'child',
        'parent_id' => $root->id,
    ]);
    $grandchild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Grandchild',
        'slug' => 'grandchild',
        'parent_id' => $child->id,
    ]);

    $this
        ->actingAs($user)
        ->delete("/notes/{$root->id}")
        ->assertRedirect(route('notes.index'));

    $this->assertSoftDeleted('notes', ['id' => $root->id]);
    $this->assertSoftDeleted('notes', ['id' => $child->id]);
    $this->assertSoftDeleted('notes', ['id' => $grandchild->id]);
});

test('restoring a soft deleted note restores descendants recursively', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Root',
        'slug' => 'root',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Child',
        'slug' => 'child',
        'parent_id' => $root->id,
    ]);
    $grandchild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Grandchild',
        'slug' => 'grandchild',
        'parent_id' => $child->id,
    ]);

    $root->delete();

    $root->restore();

    $this->assertDatabaseHas('notes', [
        'id' => $root->id,
        'deleted_at' => null,
    ]);
    $this->assertDatabaseHas('notes', [
        'id' => $child->id,
        'deleted_at' => null,
    ]);
    $this->assertDatabaseHas('notes', [
        'id' => $grandchild->id,
        'deleted_at' => null,
    ]);
});

test('notes list page shows only root notes initially for normal notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'parent_id' => $root->id,
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => 'Daily note',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/list')
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/index')
            ->has('roots', 1)
            ->where('roots.0.id', $root->id)
            ->where('roots.0.has_children', true)
            ->where('filters.type', Note::TYPE_NOTE),
        );
});

test('notes tree endpoint lazily returns children for parent', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);
    $child = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'parent_id' => $root->id,
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/tree?parent_id='.$root->id);

    $response
        ->assertOk()
        ->assertJsonCount(1, 'nodes')
        ->assertJsonPath('nodes.0.id', $child->id)
        ->assertJsonPath('nodes.0.title', 'Project 1')
        ->assertJsonPath('nodes.0.tasks_total', 0)
        ->assertJsonPath('nodes.0.tasks_open', 0);
});

test('notes tree endpoint returns task totals and open counts per note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => 'b1',
        'position' => 1,
        'checked' => false,
        'content_text' => 'Open task',
    ]);

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $note->id,
        'block_id' => 'b2',
        'position' => 2,
        'checked' => true,
        'content_text' => 'Closed task',
    ]);
    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'Acme',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => [],
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.tasks_total', 2)
        ->assertJsonPath('nodes.0.tasks_open', 1)
        ->assertJsonPath('nodes.0.revision_count', 1);

    $createdAt = data_get($response->json(), 'nodes.0.created_at');
    $updatedAt = data_get($response->json(), 'nodes.0.updated_at');

    expect($createdAt)->toBeString();
    expect($updatedAt)->toBeString();
});

test('notes tree endpoint uses model accessor values for icon metadata and taxonomy', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
        'properties' => [
            'icon' => 'alarm-clock',
            'icon-color' => 'blue',
            'icon-bg' => 'stone',
            'context' => 'client-a',
            'tags' => ['#ops', ' platform '],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.icon', 'alarm-clock')
        ->assertJsonPath('nodes.0.icon_color', 'blue')
        ->assertJsonPath('nodes.0.icon_bg', 'stone')
        ->assertJsonPath('nodes.0.context', 'client-a')
        ->assertJsonPath('nodes.0.tags.0', 'ops')
        ->assertJsonPath('nodes.0.tags.1', 'platform')
        ->assertJsonPath('nodes.0.path', 'Acme');
});

test('notes tree endpoint returns zero word count for note without content', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.word_count', 0);
});

test('note save updates persisted word count used by notes overview', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'one two three four'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $content,
            'properties' => [],
        ])
        ->assertStatus(302);

    $note->refresh();
    expect($note->word_count)->toBe(4);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.word_count', 4);
});

test('notes tree exposes journal years at top level', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'slug' => 'journal/daily/2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', 'journal:year:2026')
        ->assertJsonPath('nodes.0.is_virtual', true)
        ->assertJsonPath('nodes.0.has_children', true)
        ->assertJsonPath('nodes.0.type', Note::TYPE_JOURNAL);
});

test('notes tree exposes journal week and daily children', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_WEEKLY,
        'journal_date' => '2026-03-02',
        'title' => 'Week 10 2026',
        'slug' => 'journal/weekly/2026-W10',
    ]);

    $daily = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'slug' => 'journal/daily/2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all&parent_id=journal:month:2026-03')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', 'journal:week:2026-W10')
        ->assertJsonPath('nodes.0.has_children', true);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all&parent_id=journal:week:2026-W10')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $daily->id)
        ->assertJsonPath('nodes.0.is_virtual', false)
        ->assertJsonPath('nodes.0.has_children', false);
});

test('journal virtual period node shows metrics when backing note exists', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $monthly = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_MONTHLY,
        'journal_date' => '2026-03-01',
        'title' => 'Maart 2026',
        'slug' => 'journal/monthly/2026-03',
    ]);

    $monthly->meta = array_merge($monthly->meta ?? [], ['word_count' => 123]);
    $monthly->saveQuietly();

    NoteTask::query()->create([
        'workspace_id' => $workspace->id,
        'note_id' => $monthly->id,
        'block_id' => 'b1',
        'position' => 1,
        'checked' => false,
        'content_text' => 'Open task',
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/tree?type=all&parent_id=journal:year:2026')
        ->assertOk();

    $response
        ->assertJsonPath('nodes.0.id', 'journal:month:2026-03')
        ->assertJsonPath('nodes.0.is_virtual', true)
        ->assertJsonPath('nodes.0.has_note', true)
        ->assertJsonPath('nodes.0.href', scoped_journal_url($workspace, 'monthly', '2026-03'))
        ->assertJsonPath('nodes.0.tasks_total', 1)
        ->assertJsonPath('nodes.0.tasks_open', 1)
        ->assertJsonPath('nodes.0.word_count', 123);
});

test('journal virtual period node without backing note stays linkable for creation', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'slug' => 'journal/daily/2026-03-07',
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=all')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', 'journal:year:2026')
        ->assertJsonPath('nodes.0.is_virtual', true)
        ->assertJsonPath('nodes.0.has_note', false)
        ->assertJsonPath('nodes.0.href', scoped_journal_url($workspace, 'yearly', '2026'));
});

test('notes list filters context and keeps ancestors visible', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project 1',
        'parent_id' => $root->id,
        'properties' => [
            'context' => 'client-a',
        ],
    ]);

    $response = $this
        ->actingAs($user)
        ->get('/notes/list?context=client-a');

    $response->assertInertia(fn (Assert $page) => $page
        ->has('roots', 1)
        ->where('roots.0.id', $root->id)
        ->where('roots.0.has_children', true),
    );
});

test('notes tree token filter matches context or tags', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Acme',
    ]);

    $contextChild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Context child',
        'parent_id' => $root->id,
        'properties' => ['context' => 'client-a'],
    ]);

    $tagChild = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Tag child',
        'parent_id' => $root->id,
        'properties' => ['tags' => ['ops']],
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree?type=note&parent_id='.$root->id.'&tokens=@client-a,%23ops')
        ->assertOk()
        ->assertJsonCount(2, 'nodes')
        ->assertJsonPath('nodes.0.id', $contextChild->id)
        ->assertJsonPath('nodes.1.id', $tagChild->id);
});

test('update endpoint remains stable when note slug changes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Original title',
        'slug' => 'original-title',
    ]);

    $baseContent = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Heading title'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $baseContent,
            'properties' => [
                'title' => 'Changed title',
                'context' => 'team',
            ],
        ])
        ->assertStatus(302);

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $baseContent,
            'properties' => [
                'title' => 'Original title',
                'context' => 'team',
            ],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect(Note::query()->where('workspace_id', $workspace?->id)->count())->toBe(1);
    expect($note->title)->toBe('Original title');
});

test('property title override does not influence slug generation', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Base Title',
        'slug' => 'base-title',
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Base Title'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put('/notes/'.$note->id, [
            'content' => $content,
            'properties' => [
                'title' => 'Display Title Only',
            ],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->getRawOriginal('title'))->toBe('Base Title');
    expect($note->title)->toBe('Display Title Only');
    expect($note->slug)->toBe('base-title');
});

test('journal route creates and reuses daily journal notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $this
        ->actingAs($user)
        ->get('/journal/daily/2026-03-07')
        ->assertRedirect('/journal/2026-03-07');

    $this
        ->actingAs($user)
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteType', 'journal')
            ->where('journalGranularity', 'daily')
            ->where('journalPeriod', '2026-03-07'),
        );

    $journal = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->where('type', 'journal')
        ->where('journal_granularity', 'daily')
        ->whereDate('journal_date', '2026-03-07')
        ->first();

    expect($journal)->not()->toBeNull();

    $this->actingAs($user)->get('/journal/2026-03-07')->assertOk();

    expect(
        Note::query()
            ->where('workspace_id', $workspace?->id)
            ->where('type', 'journal')
            ->where('journal_granularity', 'daily')
            ->whereDate('journal_date', '2026-03-07')
            ->count(),
    )->toBe(1);
});

test('legacy simplified journal period url resolves with inferred granularity', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $response = $this
        ->actingAs($user)
        ->get('/journal/2026-W11');

    $response->assertInertia(fn (Assert $page) => $page
        ->where('noteType', 'journal')
        ->where('journalGranularity', 'weekly')
        ->where('journalPeriod', '2026-W11'),
    );

    $journal = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->where('type', 'journal')
        ->where('journal_granularity', 'weekly')
        ->whereDate('journal_date', '2026-03-09')
        ->first();

    expect($journal)->not()->toBeNull();
});

dataset('canonical_journal_period_cases', [
    'daily' => [
        'period' => '2026-03-07',
        'granularity' => Note::JOURNAL_DAILY,
        'date' => '2026-03-07',
    ],
    'weekly' => [
        'period' => '2026-W11',
        'granularity' => Note::JOURNAL_WEEKLY,
        'date' => '2026-03-09',
    ],
    'monthly' => [
        'period' => '2026-03',
        'granularity' => Note::JOURNAL_MONTHLY,
        'date' => '2026-03-01',
    ],
    'yearly' => [
        'period' => '2026',
        'granularity' => Note::JOURNAL_YEARLY,
        'date' => '2026-01-01',
    ],
]);

test('canonical journal period url creates missing journal notes for all granularities', function (
    string $period,
    string $granularity,
    string $date,
) {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $response = $this
        ->actingAs($user)
        ->get("/journal/{$period}");

    $response
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteType', 'journal')
            ->where('journalGranularity', $granularity)
            ->where('journalPeriod', $period),
        );

    $journal = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->where('type', Note::TYPE_JOURNAL)
        ->where('journal_granularity', $granularity)
        ->whereDate('journal_date', $date)
        ->first();

    expect($journal)->not()->toBeNull();
})->with('canonical_journal_period_cases');

test('canonical journal period url reuses existing journal notes for all granularities', function (
    string $period,
    string $granularity,
    string $date,
) {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace?->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'title' => "Existing {$granularity} journal",
        'journal_granularity' => $granularity,
        'journal_date' => $date,
    ]);

    $response = $this
        ->actingAs($user)
        ->get("/journal/{$period}");

    $response
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteType', 'journal')
            ->where('journalGranularity', $granularity)
            ->where('journalPeriod', $period),
        );

    expect(
        Note::query()
            ->where('workspace_id', $workspace?->id)
            ->where('type', Note::TYPE_JOURNAL)
            ->where('journal_granularity', $granularity)
            ->whereDate('journal_date', $date)
            ->count(),
    )->toBe(1);
})->with('canonical_journal_period_cases');

test('update uses the first h1 as note title', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'title' => null,
        'content' => null,
        'properties' => null,
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Leading paragraph'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Expected Title'],
                ],
            ],
        ],
    ];

    $response = $this
        ->actingAs($user)
        ->from(route('notes.show.legacy', ['note' => $note->id], absolute: false))
        ->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => ['context' => 'test'],
        ]);

    $response->assertRedirect(route('notes.show.legacy', ['note' => $note->id], absolute: false));

    $note->refresh();

    expect($note->title)->toBe('Expected Title');
    expect($note->properties)->toBe(['context' => 'test']);
    expect($note->content)->toBe($content);
});

test('update falls back to first text line when no h1 exists', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'title' => null,
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'First line'],
                    ['type' => 'hardBreak'],
                    ['type' => 'text', 'text' => 'Second line'],
                ],
            ],
            [
                'type' => 'heading',
                'attrs' => ['level' => 2],
                'content' => [
                    ['type' => 'text', 'text' => 'Secondary heading'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => [],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->title)->toBe('First line');
});

test('update stores heading metadata only with clean heading titles', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'title' => null,
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1, 'id' => 'h-main'],
                'content' => [
                    ['type' => 'text', 'text' => '#### Roadmap #planning'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => [],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->meta['navigation'])->toBe([
        [
            'type' => 'heading',
            'html_id' => 'h-main',
            'level' => 1,
            'text' => 'Roadmap',
        ],
    ]);
    expect($note->meta)->toHaveKey('content_hash');
});

test('json save returns updated slug url after h1 title change', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Old title',
        'slug' => 'old-title',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [
                        ['type' => 'text', 'text' => 'Old title'],
                    ],
                ],
            ],
        ],
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'New title'],
                ],
            ],
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Body'],
                ],
            ],
        ],
    ];

    $response = $this
        ->actingAs($user)
        ->putJson(route('notes.update', [
            'workspace' => $workspace->slug,
            'note' => $note->slug,
        ], absolute: false), [
            'content' => $content,
            'properties' => [],
            'save_mode' => 'auto',
        ]);

    $response
        ->assertOk()
        ->assertJson([
            'note_url' => scoped_note_url($workspace, $note->id),
            'note_update_url' => scoped_note_url($workspace, $note->id),
        ]);

    $note->refresh();
    expect($note->slug)->toBe('new-title');
});

test('regular save updates content with unchanged h1 and keeps slug stable', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Stable title',
        'slug' => 'stable-title',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [
                        ['type' => 'text', 'text' => 'Stable title'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Old body'],
                    ],
                ],
            ],
        ],
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Stable title'],
                ],
            ],
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Updated body'],
                ],
            ],
        ],
    ];

    $url = route('notes.update', [
        'workspace' => $workspace->slug,
        'note' => $note->slug,
    ], absolute: false);

    $response = $this
        ->actingAs($user)
        ->from(scoped_note_url($workspace, $note->id))
        ->put($url, [
            'content' => $content,
            'properties' => [],
            'save_mode' => 'auto',
        ]);

    $response->assertRedirect(scoped_note_url($workspace, $note->id));

    $note->refresh();
    expect($note->slug)->toBe('stable-title');
    expect(data_get($note->content, 'content.1.content.0.text'))->toBe('Updated body');
});

test('inertia xhr save does not return json response payload', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => Carbon::parse('2026-03-11'),
        'title' => 'Woensdag 11 maart 2026',
        'slug' => '2026-03-11',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [
                        ['type' => 'text', 'text' => 'Woensdag 11 maart 2026'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Old body'],
                    ],
                ],
            ],
        ],
    ]);

    $updatedContent = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Woensdag 11 maart 2026'],
                ],
            ],
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Updated body'],
                ],
            ],
        ],
    ];

    $response = $this
        ->actingAs($user)
        ->from(scoped_journal_url($workspace, 'daily', '2026-03-11'))
        ->withHeaders([
            'X-Inertia' => 'true',
            'X-Requested-With' => 'XMLHttpRequest',
            'X-Inertia-Version' => 'test-version',
            'Accept' => 'text/html, application/xhtml+xml',
        ])
        ->put(route('notes.update', [
            'workspace' => $workspace->slug,
            'note' => $note->id,
        ], absolute: false), [
            'content' => $updatedContent,
            'properties' => [],
            'save_mode' => 'auto',
        ]);

    $response->assertStatus(303);
    expect($response->headers->get('content-type'))->not->toContain('application/json');

    $note->refresh();
    expect(data_get($note->content, 'content.1.content.0.text'))->toBe('Updated body');
});

test('property title overrides derived title through model accessor', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create([
        'title' => null,
    ]);

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => 'Derived Title'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => [
                'title' => 'Property Title',
                'context' => 'docs',
            ],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->getRawOriginal('title'))->toBe('Derived Title');
    expect($note->title)->toBe('Property Title');
});

test('start can create a child note when parent_id is provided', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $parent = $user->notes()->create();

    $response = $this->actingAs($user)->get(route('notes.start', [
        'parent_id' => $parent->id,
    ], absolute: false));

    $child = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->where('parent_id', $parent->id)
        ->latest('created_at')
        ->first();

    expect($child)->not()->toBeNull();
    expect($child->slug)->not()->toBeNull();
    $response->assertRedirect(scoped_note_url($workspace, $child->id));
});

test('start can create a note with a title and optional parent', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Parent',
        'slug' => 'parent',
    ]);

    $response = $this->actingAs($user)->get(route('notes.start', [
        'title' => 'My New Note',
        'parent_id' => $parent->id,
    ], absolute: false));

    $created = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->where('parent_id', $parent->id)
        ->latest('created_at')
        ->first();

    expect($created)->not()->toBeNull();
    expect($created?->title)->toBe('My New Note');
    expect($created?->slug)->toContain('my-new-note');
    $response->assertRedirect(scoped_note_url($workspace, (string) $created?->id));
});

test('store creates a regular note with h1 content and redirects to note id', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();
    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Parent',
        'slug' => 'parent',
    ]);

    $response = $this->actingAs($user)->post('/notes', [
        'title' => 'My Document',
        'parent_id' => $parent->id,
    ]);

    $created = Note::query()
        ->where('workspace_id', $workspace?->id)
        ->where('parent_id', $parent->id)
        ->latest('created_at')
        ->first();

    expect($created)->not()->toBeNull();
    expect($created?->type)->toBe(Note::TYPE_NOTE);
    expect($created?->title)->toBe('My Document');
    expect(data_get($created?->content, 'content.0.type'))->toBe('heading');
    expect(data_get($created?->content, 'content.0.attrs.level'))->toBe(1);
    expect(data_get($created?->content, 'content.0.content.0.text'))->toBe('My Document');
    $response->assertRedirect(scoped_note_url($workspace, (string) $created?->id));
});

test('update can move a note under another note of the same user', function () {
    $user = User::factory()->create();
    $parent = $user->notes()->create();
    $note = $user->notes()->create();

    $this
        ->actingAs($user)
        ->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), [
            'content' => [
                'type' => 'doc',
                'content' => [],
            ],
            'properties' => [],
            'parent_id' => $parent->id,
        ])
        ->assertStatus(302);

    $note->refresh();

    expect($note->parent_id)->toBe($parent->id);
});

test('update rejects moving a note under its own descendant', function () {
    $user = User::factory()->create();
    $root = $user->notes()->create();
    $child = $user->notes()->create([
        'parent_id' => $root->id,
    ]);

    $response = $this
        ->actingAs($user)
        ->from(route('notes.show.legacy', ['note' => $root->id], absolute: false))
        ->put(route('notes.update.legacy', ['note' => $root->id], absolute: false), [
            'content' => [
                'type' => 'doc',
                'content' => [],
            ],
            'properties' => [],
            'parent_id' => $child->id,
        ]);

    $response
        ->assertRedirect(route('notes.show.legacy', ['note' => $root->id], absolute: false))
        ->assertSessionHasErrors('parent_id');

    $root->refresh();

    expect($root->parent_id)->toBeNull();
});

test('sidebar notes tree excludes journal notes and keeps hierarchy', function () {
    $user = User::factory()->create();

    $root = $user->notes()->create([
        'title' => 'Acme',
        'type' => 'note',
        'properties' => [
            'icon' => 'alarm-clock',
            'icon-color' => 'blue',
            'icon-bg' => 'stone',
        ],
    ]);

    $project = $user->notes()->create([
        'title' => 'Project 1',
        'type' => 'note',
        'parent_id' => $root->id,
    ]);

    $leaf = $user->notes()->create([
        'title' => 'Some note',
        'type' => 'note',
        'parent_id' => $project->id,
    ]);

    $user->notes()->create([
        'title' => 'Daily journal',
        'type' => 'journal',
    ]);

    $response = $this
        ->actingAs($user)
        ->get(route('notes.show.legacy', ['note' => $leaf->id], absolute: false));

    $response->assertInertia(fn (Assert $page) => $page
        ->has('notesTree', 1)
        ->where('notesTree.0.id', $root->id)
        ->where('notesTree.0.title', 'Acme')
        ->where('notesTree.0.icon', 'alarm-clock')
        ->where('notesTree.0.icon_color', 'blue')
        ->where('notesTree.0.icon_bg', 'stone')
        ->has('notesTree.0.children', 1)
        ->where('notesTree.0.children.0.id', $project->id)
        ->where('notesTree.0.children.0.title', 'Project 1')
        ->has('notesTree.0.children.0.children', 1)
        ->where('notesTree.0.children.0.children.0.id', $leaf->id)
        ->where('notesTree.0.children.0.children.0.title', 'Some note'),
    );
});

test('notes trees show Untitled when note title is empty', function () {
    $user = User::factory()->create();

    $note = $user->notes()->create([
        'title' => '   ',
        'type' => Note::TYPE_NOTE,
    ]);

    $this
        ->actingAs($user)
        ->get('/notes/tree')
        ->assertOk()
        ->assertJsonPath('nodes.0.id', $note->id)
        ->assertJsonPath('nodes.0.title', 'Untitled');

    $this
        ->actingAs($user)
        ->get(route('notes.show.legacy', ['note' => $note->id], absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->where('notesTree.0.id', $note->id)
            ->where('notesTree.0.title', 'Untitled'),
        );
});

test('show returns breadcrumb path for the current note', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $root = $user->notes()->create([
        'title' => 'Acme',
        'type' => 'note',
    ]);

    $project = $user->notes()->create([
        'title' => 'Project 1',
        'type' => 'note',
        'parent_id' => $root->id,
    ]);

    $leaf = $user->notes()->create([
        'title' => 'Some note',
        'type' => 'note',
        'parent_id' => $project->id,
    ]);

    $this
        ->actingAs($user)
        ->get(route('notes.show.legacy', ['note' => $leaf->id], absolute: false))
        ->assertInertia(fn (Assert $page) => $page
            ->has('breadcrumbs', 4)
            ->where('breadcrumbs.0.title', 'Notes')
            ->where('breadcrumbs.0.href', scoped_note_url($workspace, $root->id))
            ->where('breadcrumbs.1.title', 'Acme')
            ->where('breadcrumbs.1.href', scoped_note_url($workspace, $root->id))
            ->where('breadcrumbs.2.title', 'Project 1')
            ->where('breadcrumbs.2.href', scoped_note_url($workspace, $project->id))
            ->where('breadcrumbs.3.title', 'Some note')
            ->where('breadcrumbs.3.href', scoped_note_url($workspace, $leaf->id)),
        );
});

test('daily journal note shows year month week and day breadcrumbs', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $this
        ->actingAs($user)
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->has('breadcrumbs', 5)
            ->where('breadcrumbs.0.title', 'Journal')
            ->where('breadcrumbs.0.href', scoped_journal_url($workspace, 'daily', '2026-03-07'))
            ->where('breadcrumbs.1.title', '2026')
            ->where('breadcrumbs.1.href', scoped_journal_url($workspace, 'yearly', '2026'))
            ->where('breadcrumbs.2.title', 'Maart')
            ->where('breadcrumbs.2.href', scoped_journal_url($workspace, 'monthly', '2026-03'))
            ->where('breadcrumbs.3.title', 'Week 10')
            ->where('breadcrumbs.3.href', scoped_journal_url($workspace, 'weekly', '2026-W10'))
            ->where('breadcrumbs.4.title', 'Zaterdag 7 maart 2026')
            ->where('breadcrumbs.4.href', scoped_journal_url($workspace, 'daily', '2026-03-07')),
        );
});

test('daily journal note uses english title and breadcrumbs when user language is english', function () {
    $user = User::factory()->create([
        'settings' => ['language' => 'en'],
    ]);

    $this
        ->actingAs($user)
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('breadcrumbs.2.title', 'March')
            ->where('breadcrumbs.4.title', 'Saturday 7 March 2026')
            ->where('content.content.0.content.0.text', 'Saturday 7 March 2026'),
        );
});

test('journal page keeps active workspace context and exposes personal workspace summary', function () {
    $user = User::factory()->create();
    $personalWorkspace = $user->currentWorkspace();

    $activeWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
        'is_personal' => false,
    ]);
    $activeWorkspace->users()->syncWithoutDetaching([
        $user->id => ['role' => 'owner'],
    ]);

    $user->forceFill([
        'settings' => [
            ...(is_array($user->settings) ? $user->settings : []),
            'workspace_id' => $activeWorkspace->id,
        ],
    ])->save();

    $this
        ->actingAs($user->fresh())
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('currentWorkspace.id', $activeWorkspace->id)
            ->where('currentWorkspace.slug', $activeWorkspace->slug)
            ->where('personalWorkspace.id', $personalWorkspace?->id)
            ->where('personalWorkspace.slug', $personalWorkspace?->slug),
        );
});

test('show includes meeting children with workspace-scoped hrefs', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project',
        'slug' => 'project',
    ]);

    $meeting = $workspace->notes()->create([
        'type' => Note::TYPE_MEETING,
        'title' => 'Kickoff',
        'slug' => 'project/kickoff',
        'parent_id' => $parent->id,
        'meta' => ['event_block_id' => 'block-1', 'starts_at' => '2026-03-18T10:00:00Z'],
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $parent->id))
        ->assertInertia(fn (Assert $page) => $page
            ->has('meetingChildren', 1)
            ->where('meetingChildren.0.id', $meeting->id)
            ->where('meetingChildren.0.href', scoped_note_url($workspace, $meeting->id)),
        );
});

test('show meeting note includes sibling meeting hrefs with correct workspace slug', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Project',
        'slug' => 'project',
    ]);

    $meetingA = $workspace->notes()->create([
        'type' => Note::TYPE_MEETING,
        'title' => 'Sprint 1',
        'slug' => 'project/sprint-1',
        'parent_id' => $parent->id,
        'meta' => ['starts_at' => '2026-03-10T09:00:00Z'],
    ]);

    $meetingB = $workspace->notes()->create([
        'type' => Note::TYPE_MEETING,
        'title' => 'Sprint 2',
        'slug' => 'project/sprint-2',
        'parent_id' => $parent->id,
        'meta' => ['starts_at' => '2026-03-17T09:00:00Z'],
    ]);

    $this
        ->actingAs($user)
        ->get(scoped_note_url($workspace, $meetingA->id))
        ->assertInertia(fn (Assert $page) => $page
            ->has('meetingChildren', 2)
            ->where('meetingChildren.0.href', scoped_note_url($workspace, $meetingB->id))
            ->where('meetingChildren.1.href', scoped_note_url($workspace, $meetingA->id)),
        );

});

test('daily journal note includes due and deadline tasks for that day excluding current note tasks', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $currentDaily = $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'daily-self-task',
                        'checked' => false,
                        'dueDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Should be excluded']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $dueNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Due note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'due-task-1',
                        'checked' => false,
                        'dueDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Due today']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $deadlineNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Deadline note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'deadline-task-1',
                        'checked' => false,
                        'deadlineDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Deadline today']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Outside note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'outside-task-1',
                        'checked' => false,
                        'dueDate' => '2026-03-08',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Outside day']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $wikiOnlyNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Wiki only note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'wiki-only-task',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [
                            ['type' => 'text', 'text' => 'Linked to day '],
                            [
                                'type' => 'text',
                                'text' => 'Daily note',
                                'marks' => [[
                                    'type' => 'wikiLink',
                                    'attrs' => [
                                        'noteId' => $currentDaily->id,
                                        'href' => "/notes/{$currentDaily->id}",
                                    ],
                                ]],
                            ],
                        ],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->where('noteId', $currentDaily->id)
            ->loadDeferredProps('related-panel', fn (Assert $deferred) => $deferred
                ->has('relatedTasks', 3)
                ->where('relatedTasks.0.note_id', $dueNote->id)
                ->where('relatedTasks.0.content', 'Due today')
                ->where('relatedTasks.0.due_date', '2026-03-07')
                ->where('relatedTasks.1.note_id', $deadlineNote->id)
                ->where('relatedTasks.1.content', 'Deadline today')
                ->where('relatedTasks.1.deadline_date', '2026-03-07')
                ->where('relatedTasks.2.note_id', $wikiOnlyNote->id),
            ),
        );
});

test('toggling a daily task updates persisted checked state reflected on daily note panel reload', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-07',
        'title' => 'Zaterdag 7 maart 2026',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $taskNote = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Task source note',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'daily-toggle-task',
                        'checked' => false,
                        'dueDate' => '2026-03-07',
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Toggle from daily panel']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $task = NoteTask::query()
        ->where('note_id', $taskNote->id)
        ->where('block_id', 'daily-toggle-task')
        ->firstOrFail();

    $this
        ->actingAs($user)
        ->patch('/tasks/checked', [
            'note_id' => $task->note_id,
            'block_id' => $task->block_id,
            'position' => $task->position,
            'checked' => true,
        ])
        ->assertRedirect();

    $this
        ->actingAs($user)
        ->get('/journal/2026-03-07')
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('related-panel', fn (Assert $deferred) => $deferred
                ->has('relatedTasks', 1)
                ->where('relatedTasks.0.note_id', $taskNote->id)
                ->where('relatedTasks.0.checked', true),
            ),
        );
});

test('weekly and monthly journal related panels include period token scheduled tasks', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_WEEKLY,
        'journal_date' => '2026-05-25',
        'title' => 'Week 22 2026',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_MONTHLY,
        'journal_date' => '2026-06-01',
        'title' => 'June 2026',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $weeklySource = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Weekly source',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'weekly-token-task',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Weekly task >2026-W22']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $monthlySource = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Monthly source',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'monthly-token-task',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => [['type' => 'text', 'text' => 'Monthly task >>2026-06']],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get('/journal/2026-W22')
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('related-panel', fn (Assert $deferred) => $deferred
                ->has('relatedTasks', 1)
                ->where('relatedTasks.0.note_id', $weeklySource->id)
                ->where('relatedTasks.0.due_date_token', '2026-W22'),
            ),
        );

    $this
        ->actingAs($user)
        ->get('/journal/2026-06')
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('related-panel', fn (Assert $deferred) => $deferred
                ->has('relatedTasks', 1)
                ->where('relatedTasks.0.note_id', $monthlySource->id)
                ->where('relatedTasks.0.deadline_date_token', '2026-06'),
            ),
        );
});

test('regular note includes related tasks that link to it', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target note',
    ]);

    $sourceWithLink = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source with link',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'related-task-1',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'attrs' => ['id' => 'related-task-1-p'],
                        'content' => [
                            ['type' => 'text', 'text' => 'Task about '],
                            [
                                'type' => 'text',
                                'text' => 'Target note',
                                'marks' => [[
                                    'type' => 'wikiLink',
                                    'attrs' => [
                                        'noteId' => $target->id,
                                        'href' => "/notes/{$target->id}",
                                    ],
                                ]],
                            ],
                        ],
                    ]],
                ]],
            ]],
        ],
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source without link',
        'content' => [
            'type' => 'doc',
            'content' => [[
                'type' => 'taskList',
                'content' => [[
                    'type' => 'taskItem',
                    'attrs' => [
                        'id' => 'related-task-2',
                        'checked' => false,
                    ],
                    'content' => [[
                        'type' => 'paragraph',
                        'attrs' => ['id' => 'related-task-2-p'],
                        'content' => [
                            ['type' => 'text', 'text' => 'Not related'],
                        ],
                    ]],
                ]],
            ]],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get("/notes/{$target->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('related-panel', fn (Assert $deferred) => $deferred
                ->has('relatedTasks', 1)
                ->where('relatedTasks.0.note_id', $sourceWithLink->id)
                ->where('relatedTasks.0.block_id', 'related-task-1')
                ->where('relatedTasks.0.checked', false),
            ),
        );
});

test('regular note includes backlinks with snippet', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target note',
    ]);

    $source = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source note',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['id' => 'h-source', 'level' => 2],
                    'content' => [
                        ['type' => 'text', 'text' => 'Planning'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => ['id' => 'p-source'],
                    'content' => [
                        ['type' => 'text', 'text' => 'See '],
                        [
                            'type' => 'text',
                            'text' => 'Target note',
                            'marks' => [[
                                'type' => 'wikiLink',
                                'attrs' => [
                                    'noteId' => $target->id,
                                    'href' => "/notes/{$target->id}",
                                ],
                            ]],
                        ],
                        ['type' => 'text', 'text' => ' for details'],
                    ],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get("/notes/{$target->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('related-panel', fn (Assert $deferred) => $deferred
                ->has('backlinks', 1)
                ->where('backlinks.0.block_id', 'p-source')
                ->where('backlinks.0.render_fragments.1.type', 'wikilink')
                ->where('backlinks.0.render_fragments.1.text', 'Target note')
                ->where('backlinks.0.note.id', $source->id)
                ->where('backlinks.0.note.title', 'Source note')
                ->where('backlinks.0.href', scoped_note_url($workspace, $source->id).'#p-source'),
            ),
        );
});

test('backlinks omit task blocks that already appear in related tasks', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $target = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Target note',
    ]);

    $source = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Source mixed',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['id' => 'h-mixed', 'level' => 2],
                    'content' => [
                        ['type' => 'text', 'text' => 'Section'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => ['id' => 'p-mixed'],
                    'content' => [
                        ['type' => 'text', 'text' => 'Paragraph link to '],
                        [
                            'type' => 'text',
                            'text' => 'Target note',
                            'marks' => [[
                                'type' => 'wikiLink',
                                'attrs' => [
                                    'noteId' => $target->id,
                                    'href' => "/notes/{$target->id}",
                                ],
                            ]],
                        ],
                    ],
                ],
                [
                    'type' => 'taskList',
                    'content' => [[
                        'type' => 'taskItem',
                        'attrs' => ['id' => 'task-mixed', 'checked' => false],
                        'content' => [[
                            'type' => 'paragraph',
                            'attrs' => ['id' => 'task-mixed-p'],
                            'content' => [
                                ['type' => 'text', 'text' => 'Task link to '],
                                [
                                    'type' => 'text',
                                    'text' => 'Target note',
                                    'marks' => [[
                                        'type' => 'wikiLink',
                                        'attrs' => [
                                            'noteId' => $target->id,
                                            'href' => "/notes/{$target->id}",
                                        ],
                                    ]],
                                ],
                            ],
                        ]],
                    ]],
                ],
            ],
        ],
    ]);

    $this
        ->actingAs($user)
        ->get("/notes/{$target->id}")
        ->assertInertia(fn (Assert $page) => $page
            ->loadDeferredProps('related-panel', fn (Assert $deferred) => $deferred
                ->has('relatedTasks', 1)
                ->where('relatedTasks.0.note_id', $source->id)
                ->where('relatedTasks.0.block_id', 'task-mixed')
                ->has('backlinks', 1)
                ->where('backlinks.0.block_id', 'p-mixed')
                ->where('backlinks.0.note.id', $source->id),
            ),
        );
});

test('update preserves leading and trailing spaces in tiptap text nodes', function () {
    $user = User::factory()->create();
    $note = $user->notes()->create();

    $content = [
        'type' => 'doc',
        'content' => [
            [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'before '],
                    [
                        'type' => 'mention',
                        'attrs' => [
                            'id' => 'Lea Thompson',
                            'label' => 'Lea Thompson',
                            'mentionSuggestionChar' => '@',
                        ],
                    ],
                    ['type' => 'text', 'text' => ' and '],
                    [
                        'type' => 'hashtag',
                        'attrs' => [
                            'id' => 'work',
                            'label' => 'work',
                            'mentionSuggestionChar' => '#',
                        ],
                    ],
                    ['type' => 'text', 'text' => ' after'],
                ],
            ],
        ],
    ];

    $this
        ->actingAs($user)
        ->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), [
            'content' => $content,
            'properties' => [],
        ])
        ->assertStatus(302);

    $note->refresh();

    expect(data_get($note->content, 'content.0.content.0.text'))->toBe('before ');
    expect(data_get($note->content, 'content.0.content.2.text'))->toBe(' and ');
    expect(data_get($note->content, 'content.0.content.4.text'))->toBe(' after');
});

test('manual save always creates a note revision', function () {
    config()->set('note-revisions.autosave.default_interval_minutes', 15);

    $user = User::factory()->create();
    $note = $user->notes()->create();

    $payload = [
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Revision content'],
                    ],
                ],
            ],
        ],
        'properties' => ['context' => 'manual'],
        'save_mode' => 'manual',
    ];

    $this->actingAs($user)->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), $payload);
    $this->actingAs($user)->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), $payload);

    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(2);
});

test('autosave revisions respect user configured interval', function () {
    config()->set('note-revisions.autosave.default_interval_minutes', 15);

    $user = User::factory()->create([
        'settings' => [
            'notes' => [
                'revision_autosave_interval_minutes' => 5,
            ],
        ],
    ]);
    $note = $user->notes()->create();

    $payload = [
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'content' => [
                        ['type' => 'text', 'text' => 'Autosave snapshot'],
                    ],
                ],
            ],
        ],
        'properties' => ['context' => 'auto'],
        'save_mode' => 'auto',
    ];

    $this->actingAs($user)->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), $payload);
    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(1);

    $this->travel(4)->minutes();
    $this->actingAs($user)->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), $payload);
    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(1);

    $this->travel(2)->minutes();
    $this->actingAs($user)->put(route('notes.update.legacy', ['note' => $note->id], absolute: false), $payload);
    expect(NoteRevision::query()->where('note_id', $note->id)->count())->toBe(2);
});

test('prune command applies retention windows to note revisions', function () {
    Carbon::setTestNow('2026-03-07 12:00:00');

    config()->set('note-revisions.retention.keep_all_for_hours', 1);
    config()->set('note-revisions.retention.keep_hourly_for_days', 1);
    config()->set('note-revisions.retention.keep_daily_for_days', 7);
    config()->set('note-revisions.retention.keep_weekly_for_weeks', 4);
    config()->set('note-revisions.retention.keep_monthly_for_months', 3);

    $user = User::factory()->create();
    $note = $user->notes()->create();

    $keepRecent = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'recent',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'recent'],
        'created_at' => now()->subMinutes(30),
        'updated_at' => now()->subMinutes(30),
    ]);

    $keepDaily = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'daily-keep',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'daily'],
        'created_at' => now()->subDays(2)->setTime(12, 0),
        'updated_at' => now()->subDays(2)->setTime(12, 0),
    ]);

    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'daily-drop',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'daily'],
        'created_at' => now()->subDays(2)->setTime(8, 0),
        'updated_at' => now()->subDays(2)->setTime(8, 0),
    ]);

    $weeklyKeepAt = now()->subWeeks(2)->startOfWeek()->addHours(10);
    $keepWeekly = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'weekly-keep',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'weekly'],
        'created_at' => $weeklyKeepAt,
        'updated_at' => $weeklyKeepAt,
    ]);

    $weeklyDropAt = now()->subWeeks(2)->startOfWeek()->addHours(2);
    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'weekly-drop',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'weekly'],
        'created_at' => $weeklyDropAt,
        'updated_at' => $weeklyDropAt,
    ]);

    // Monthly phase: older than 4 weeks (weekly window), within 3 months.
    $monthlyKeepAt = now()->subWeeks(7)->startOfMonth()->addHours(10);
    $keepMonthly = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'monthly-keep',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'monthly'],
        'created_at' => $monthlyKeepAt,
        'updated_at' => $monthlyKeepAt,
    ]);

    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'monthly-drop',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'monthly'],
        'created_at' => $monthlyKeepAt->copy()->subHours(4),
        'updated_at' => $monthlyKeepAt->copy()->subHours(4),
    ]);

    // Yearly phase: older than 3 months (monthly window).
    $yearlyKeepAt = now()->subYears(2)->startOfYear()->addDays(10);
    $keepYearly = NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'yearly-keep',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'yearly'],
        'created_at' => $yearlyKeepAt,
        'updated_at' => $yearlyKeepAt,
    ]);

    NoteRevision::query()->create([
        'note_id' => $note->id,
        'user_id' => $user->id,
        'title' => 'yearly-drop',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => ['context' => 'yearly'],
        'created_at' => $yearlyKeepAt->copy()->subDays(5),
        'updated_at' => $yearlyKeepAt->copy()->subDays(5),
    ]);

    $this->artisan('notes:prune-revisions')->assertSuccessful();

    $remaining = NoteRevision::query()
        ->where('note_id', $note->id)
        ->pluck('id')
        ->all();

    expect($remaining)->toContain(
        $keepRecent->id,
        $keepDaily->id,
        $keepWeekly->id,
        $keepMonthly->id,
        $keepYearly->id,
    );
    expect($remaining)->toHaveCount(5);

    Carbon::setTestNow();
});

test('start links meeting note to event via event_block_id', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    // Create a parent note to hold the meeting
    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Parent',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    // Create a timeblock and its event manually
    $timeblock = \App\Models\Timeblock::create(['location' => 'office']);
    $event = \App\Models\Event::create([
        'workspace_id' => $workspace->id,
        'block_id' => 'test-block-id-123',
        'eventable_type' => \App\Models\Timeblock::class,
        'eventable_id' => $timeblock->id,
        'title' => 'Standup',
        'starts_at' => '2026-03-15 09:00:00',
        'ends_at' => '2026-03-15 09:30:00',
        'timezone' => 'Europe/Amsterdam',
        'journal_date' => '2026-03-15',
    ]);

    $response = $this->actingAs($user)->get(route('notes.start', [
        'title' => 'Standup',
        'parent_id' => $parent->id,
        'type' => 'meeting',
        'event_block_id' => 'test-block-id-123',
    ]));

    $note = Note::query()
        ->where('workspace_id', $workspace->id)
        ->where('type', Note::TYPE_MEETING)
        ->latest()
        ->first();

    expect($note)->not()->toBeNull();
    expect($note->type)->toBe(Note::TYPE_MEETING);
    expect($note->meta)->toHaveKey('event_block_id', 'test-block-id-123');
    expect($note->meta)->toHaveKey('starts_at');
    expect($note->meta)->toHaveKey('ends_at');
    expect($note->meta)->toHaveKey('timezone', 'Europe/Amsterdam');
    expect($note->meta)->toHaveKey('location', 'office');
});

test('note observer preserves custom meta keys across saves', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Test',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    // Manually set a custom meta key (simulating what linkMeetingNoteToEvent does)
    $note->meta = array_merge(is_array($note->meta) ? $note->meta : [], [
        'event_block_id' => 'some-block-id',
        'starts_at' => '2026-03-15T09:00:00+00:00',
    ]);
    $note->saveQuietly();

    // Now trigger a regular save (which fires the observer)
    $note->title = 'Updated Title';
    $note->save();

    $fresh = $note->fresh();
    expect($fresh->meta)->toHaveKey('event_block_id', 'some-block-id');
    expect($fresh->meta)->toHaveKey('starts_at', '2026-03-15T09:00:00+00:00');
    expect($fresh->meta)->toHaveKey('navigation'); // content-derived key still present
});

test('detach from event converts meeting note to regular note and clears event meta', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => \App\Models\Note::TYPE_MEETING,
        'title' => 'Standup',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $note->meta = [
        'navigation' => [],
        'event_block_id' => 'some-block-id',
        'starts_at' => '2026-03-15T09:00:00+00:00',
        'ends_at' => '2026-03-15T09:30:00+00:00',
        'timezone' => 'Europe/Amsterdam',
        'location' => 'office',
    ];
    $note->saveQuietly();

    $this->actingAs($user)
        ->patch(route('notes.detach-from-event', $note->id))
        ->assertRedirect();

    $fresh = $note->fresh();
    expect($fresh->type)->toBe(\App\Models\Note::TYPE_NOTE);
    expect($fresh->meta)->not()->toHaveKey('event_block_id');
    expect($fresh->meta)->not()->toHaveKey('starts_at');
    expect($fresh->meta)->not()->toHaveKey('ends_at');
    expect($fresh->meta)->not()->toHaveKey('timezone');
    expect($fresh->meta)->not()->toHaveKey('location');
    expect($fresh->meta)->toHaveKey('navigation'); // non-event meta preserved
});

test('detach from event is forbidden on regular notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => \App\Models\Note::TYPE_NOTE,
        'title' => 'Regular',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $this->actingAs($user)
        ->patch(route('notes.detach-from-event', $note->id))
        ->assertNotFound();
});

test('attach to event converts regular note to meeting note and sets event meta', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'My Note',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $timeblock = \App\Models\Timeblock::create(['location' => 'boardroom']);
    \App\Models\Event::create([
        'workspace_id' => $workspace->id,
        'block_id' => 'event-block-xyz',
        'eventable_type' => \App\Models\Timeblock::class,
        'eventable_id' => $timeblock->id,
        'title' => 'Team Meeting',
        'starts_at' => '2026-03-15 10:00:00',
        'ends_at' => '2026-03-15 10:30:00',
        'timezone' => 'Europe/Amsterdam',
        'journal_date' => '2026-03-15',
    ]);

    $this->actingAs($user)
        ->patch(route('notes.attach-to-event', $note->id), [
            'event_block_id' => 'event-block-xyz',
        ])
        ->assertRedirect();

    $fresh = $note->fresh();
    expect($fresh->type)->toBe(Note::TYPE_MEETING);
    expect($fresh->meta)->toHaveKey('event_block_id', 'event-block-xyz');
    expect($fresh->meta)->toHaveKey('starts_at');
    expect($fresh->meta)->toHaveKey('ends_at');
    expect($fresh->meta)->toHaveKey('location', 'boardroom');
});

test('attach to event is forbidden on meeting notes', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_MEETING,
        'title' => 'Already a meeting',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $this->actingAs($user)
        ->patch(route('notes.attach-to-event', $note->id), [
            'event_block_id' => 'any-block-id',
        ])
        ->assertNotFound();
});

test('attach to event is forbidden on notes that have meeting note children', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $parent = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Parent',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $workspace->notes()->create([
        'type' => Note::TYPE_MEETING,
        'title' => 'Meeting child',
        'content' => ['type' => 'doc', 'content' => []],
        'parent_id' => $parent->id,
    ]);

    $this->actingAs($user)
        ->patch(route('notes.attach-to-event', $parent->id), [
            'event_block_id' => 'any-block-id',
        ])
        ->assertStatus(422);
});

test('user can view note revisions history page', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'My Note',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $note->revisions()->create([
        'user_id' => $user->id,
        'title' => 'My Note',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => null,
    ]);

    $this->actingAs($user)
        ->get(route('notes.revisions', $note->id))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/revisions')
            ->where('noteId', $note->id)
            ->has('revisions', 1)
        );
});

test('user can view note revisions history even when preferred workspace differs', function () {
    $user = User::factory()->create();
    $noteWorkspace = $user->currentWorkspace();

    $otherWorkspace = Workspace::factory()->create([
        'owner_id' => $user->id,
    ]);

    $user->forceFill([
        'settings' => array_merge(
            is_array($user->settings) ? $user->settings : [],
            ['workspace_id' => $otherWorkspace->id],
        ),
    ])->save();

    $note = $noteWorkspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'History target',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $note->revisions()->create([
        'user_id' => $user->id,
        'title' => 'History target',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => null,
    ]);

    $this->actingAs($user)
        ->get(route('notes.revisions', $note->id))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/revisions')
            ->where('noteId', $note->id)
            ->has('revisions', 1)
        );
});

test('user can view a specific note revision', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'My Note',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $revision = $note->revisions()->create([
        'user_id' => $user->id,
        'title' => 'Old Title',
        'content' => ['type' => 'doc', 'content' => []],
        'properties' => null,
    ]);

    $this->actingAs($user)
        ->get(route('notes.revisions.show', [$note->id, $revision->id]))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page
            ->component('notes/revisions')
            ->where('currentRevisionId', $revision->id)
        );
});

test('user can restore a note revision', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    $note = $workspace->notes()->create([
        'type' => Note::TYPE_NOTE,
        'title' => 'Current Title',
        'content' => ['type' => 'doc', 'content' => []],
    ]);

    $revision = $note->revisions()->create([
        'user_id' => $user->id,
        'title' => 'Old Title',
        'content' => ['type' => 'doc', 'content' => [['type' => 'paragraph']]],
        'properties' => null,
    ]);

    $revisionCountBefore = $note->revisions()->count();

    $this->actingAs($user)
        ->post(route('notes.revisions.restore', [$note->id, $revision->id]))
        ->assertRedirect();

    $note->refresh();
    expect($note->title)->toBe('Old Title');
    // A new revision was created for the current state before restoring.
    expect($note->revisions()->count())->toBe($revisionCountBefore + 1);
});
