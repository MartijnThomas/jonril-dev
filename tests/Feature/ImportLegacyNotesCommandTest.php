<?php

use App\Domain\LegacyImport\LegacyMarkdownToTiptapConverter;
use App\Models\LegacyNote;
use App\Models\Note;
use App\Models\User;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

test('legacy import stores original payloads and converts notes to tiptap', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not()->toBeNull();

    $notesFile = storage_path('framework/testing/legacy-notes-test.json');
    $blocksFile = storage_path('framework/testing/legacy-note-blocks-test.json');
    File::ensureDirectoryExists(dirname($notesFile));

    $notesPayload = [
        [
            'id' => 101,
            'team_id' => 1,
            'slug' => 'Projects/Alpha/Plan',
            'title' => null,
            'markdown' => "# Plan\n\n- [ ] ! Do it with @Lea and #work >2026-03-10\n- Template opties mogelijk maken. [Discussie met ChatGPT over mogelijkheden](https://chatgpt.com/share/6992c5cf-0800-800a-9528-d0535cc2a476)\n\n\\[\\[Projects/Alpha/Specs|Specs]]",
            'frontmatter' => '{"project":"alpha","context":"planning"}',
            'content_hash' => 'hash-plan',
            'created_at' => '2026-03-01 08:00:00',
            'updated_at' => '2026-03-01 09:00:00',
            'deleted_at' => null,
        ],
        [
            'id' => 102,
            'team_id' => 1,
            'slug' => 'Projects/Alpha/Specs',
            'title' => 'Specs',
            'markdown' => "# Specs\n\nReference note",
            'frontmatter' => '[]',
            'content_hash' => 'hash-specs',
            'created_at' => '2026-03-01 08:10:00',
            'updated_at' => '2026-03-01 09:10:00',
            'deleted_at' => null,
        ],
        [
            'id' => 103,
            'team_id' => 1,
            'slug' => 'journals/2026/03/2026-03-08',
            'title' => null,
            'markdown' => "# Sunday 8 March 2026\n\n- [x] Done #journal",
            'frontmatter' => '{"type":"daily-note"}',
            'content_hash' => 'hash-journal',
            'created_at' => '2026-03-08 08:00:00',
            'updated_at' => '2026-03-08 09:00:00',
            'deleted_at' => null,
        ],
    ];

    $blocksPayload = [
        [
            'id' => 1,
            'block_id' => 'b_plan_1',
            'note_slug' => 'Projects/Alpha/Plan',
            'note_id' => 101,
            'team_id' => 1,
            'type' => 'heading',
            'location_id' => 'l_1_1::b_1',
            'path' => 'b_1',
            'range_start' => 1,
            'range_end' => 1,
            'markdown' => '# Plan',
            'text' => 'Plan',
            'meta' => '{"level":1}',
            'mentions' => '[]',
            'hashtags' => '[]',
            'wikilinks' => '[]',
        ],
        [
            'id' => 2,
            'block_id' => 'b_plan_2',
            'note_slug' => 'Projects/Alpha/Plan',
            'note_id' => 101,
            'team_id' => 1,
            'type' => 'list_block',
            'location_id' => 'l_3_3::b_2',
            'path' => 'b_2',
            'range_start' => 3,
            'range_end' => 3,
            'markdown' => "- [ ] ! Do it with @Lea and #work >2026-03-10\n- Template opties mogelijk maken. [Discussie met ChatGPT over mogelijkheden](https://chatgpt.com/share/6992c5cf-0800-800a-9528-d0535cc2a476)",
            'text' => '[ ] ! Do it with @Lea and #work >2026-03-10 Template opties mogelijk maken. [Discussie met ChatGPT over mogelijkheden](https://chatgpt.com/share/6992c5cf-0800-800a-9528-d0535cc2a476)',
            'meta' => '{}',
            'mentions' => '["Lea"]',
            'hashtags' => '["work"]',
            'wikilinks' => '[]',
        ],
        [
            'id' => 3,
            'block_id' => 't_plan_2_1',
            'note_slug' => 'Projects/Alpha/Plan',
            'note_id' => 101,
            'team_id' => 1,
            'type' => 'task_item',
            'location_id' => 'l_3_3::b_2.li_1',
            'path' => 'b_2.li_1',
            'range_start' => 3,
            'range_end' => 3,
            'markdown' => '- [ ] ! Do it with @Lea and #work >2026-03-10',
            'text' => '! Do it with @Lea and #work >2026-03-10',
            'meta' => '{"task":{"prio":1,"status":"open","checkbox":" ","due":"2026-03-10"}}',
            'mentions' => '["Lea"]',
            'hashtags' => '["work"]',
            'wikilinks' => '[]',
        ],
        [
            'id' => 4,
            'block_id' => 'b_plan_3',
            'note_slug' => 'Projects/Alpha/Plan',
            'note_id' => 101,
            'team_id' => 1,
            'type' => 'paragraph',
            'location_id' => 'l_5_5::b_3',
            'path' => 'b_3',
            'range_start' => 5,
            'range_end' => 5,
            'markdown' => '\\[\\[Projects/Alpha/Specs|Specs]]',
            'text' => '[[Projects/Alpha/Specs|Specs]]',
            'meta' => '{}',
            'mentions' => '[]',
            'hashtags' => '[]',
            'wikilinks' => '[{"raw":"[[Projects/Alpha/Specs|Specs]]","target":"Projects/Alpha/Specs","title":"Specs"}]',
        ],
        [
            'id' => 5,
            'block_id' => 'b_specs_1',
            'note_slug' => 'Projects/Alpha/Specs',
            'note_id' => 102,
            'team_id' => 1,
            'type' => 'heading',
            'location_id' => 'l_1_1::b_1',
            'path' => 'b_1',
            'range_start' => 1,
            'range_end' => 1,
            'markdown' => '# Specs',
            'text' => 'Specs',
            'meta' => '{"level":1}',
            'mentions' => '[]',
            'hashtags' => '[]',
            'wikilinks' => '[]',
        ],
        [
            'id' => 6,
            'block_id' => 'b_journal_1',
            'note_slug' => 'journals/2026/03/2026-03-08',
            'note_id' => 103,
            'team_id' => 1,
            'type' => 'heading',
            'location_id' => 'l_1_1::b_1',
            'path' => 'b_1',
            'range_start' => 1,
            'range_end' => 1,
            'markdown' => '# Sunday 8 March 2026',
            'text' => 'Sunday 8 March 2026',
            'meta' => '{"level":1}',
            'mentions' => '[]',
            'hashtags' => '[]',
            'wikilinks' => '[]',
        ],
        [
            'id' => 7,
            'block_id' => 'b_journal_2',
            'note_slug' => 'journals/2026/03/2026-03-08',
            'note_id' => 103,
            'team_id' => 1,
            'type' => 'list_block',
            'location_id' => 'l_3_3::b_2',
            'path' => 'b_2',
            'range_start' => 3,
            'range_end' => 3,
            'markdown' => '- [x] Done #journal',
            'text' => '[x] Done #journal',
            'meta' => '{}',
            'mentions' => '[]',
            'hashtags' => '["journal"]',
            'wikilinks' => '[]',
        ],
        [
            'id' => 8,
            'block_id' => 't_journal_2_1',
            'note_slug' => 'journals/2026/03/2026-03-08',
            'note_id' => 103,
            'team_id' => 1,
            'type' => 'task_item',
            'location_id' => 'l_3_3::b_2.li_1',
            'path' => 'b_2.li_1',
            'range_start' => 3,
            'range_end' => 3,
            'markdown' => '- [x] Done #journal',
            'text' => 'Done #journal',
            'meta' => '{"task":{"status":"done","checkbox":"x"}}',
            'mentions' => '[]',
            'hashtags' => '["journal"]',
            'wikilinks' => '[]',
        ],
    ];

    file_put_contents($notesFile, json_encode($notesPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    file_put_contents($blocksFile, json_encode($blocksPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

    $this->artisan('notes:import-legacy', [
        '--workspace' => $workspace->id,
        '--notes' => Str::replaceFirst(base_path().'/', '', $notesFile),
        '--blocks' => Str::replaceFirst(base_path().'/', '', $blocksFile),
        '--force' => true,
    ])->assertExitCode(0);

    $projects = Note::query()->where('workspace_id', $workspace->id)->where('title', 'Projects')->first();
    $alpha = Note::query()->where('workspace_id', $workspace->id)->where('title', 'Alpha')->first();
    $plan = Note::query()->where('workspace_id', $workspace->id)->where('title', 'Plan')->first();
    $specs = Note::query()->where('workspace_id', $workspace->id)->where('title', 'Specs')->first();
    $journal = Note::query()
        ->where('workspace_id', $workspace->id)
        ->where('type', Note::TYPE_JOURNAL)
        ->where('journal_granularity', Note::JOURNAL_DAILY)
        ->whereDate('journal_date', '2026-03-08')
        ->first();

    expect($projects)->not()->toBeNull();
    expect($alpha)->not()->toBeNull();
    expect($plan)->not()->toBeNull();
    expect($specs)->not()->toBeNull();
    expect($journal)->not()->toBeNull();

    expect(data_get($projects?->properties, 'legacy_synthetic_folder'))->toBeTrue();
    expect(data_get($alpha?->properties, 'legacy_synthetic_folder'))->toBeTrue();
    expect($alpha?->parent_id)->toBe($projects?->id);
    expect(data_get($projects?->content, 'content.0.type'))->toBe('heading');
    expect(data_get($projects?->content, 'content.0.content.0.text'))->toBe('Projects');
    expect((int) ($projects?->word_count ?? 0))->toBeGreaterThan(0);
    expect($plan?->parent_id)->toBe($alpha?->id);
    expect(data_get($plan?->properties, 'project'))->toBe('alpha');
    expect(data_get($plan?->properties, 'context'))->toBe('planning');

    $taskNode = data_get($plan?->content, 'content.1.content.0');
    expect((string) data_get($plan?->content, 'attrs.id'))->not->toBe('');
    expect((string) data_get($plan?->content, 'content.0.attrs.id'))->not->toBe('');
    expect(data_get($taskNode, 'type'))->toBe('taskItem');
    expect(data_get($taskNode, 'attrs.checked'))->toBeFalse();
    expect(data_get($taskNode, 'attrs.dueDate'))->toBe('2026-03-10');
    expect((string) data_get($taskNode, 'attrs.id'))->not->toBe('');
    expect(data_get($taskNode, 'attrs.id'))->not->toBe('t_plan_2_1');
    expect(data_get($taskNode, 'attrs.legacy_id'))->toBe('t_plan_2_1');
    expect(data_get($taskNode, 'content.0.content.1.type'))->toBe('mention');
    expect(data_get($taskNode, 'content.0.content.3.type'))->toBe('hashtag');

    $planJson = json_encode($plan?->content);
    expect($planJson)->toContain('"wikiLink"');
    expect($planJson)->toContain((string) $specs?->id);
    expect($planJson)->toContain('"type":"link"');
    expect($planJson)->toContain('chatgpt.com\\/share\\/6992c5cf-0800-800a-9528-d0535cc2a476');

    $legacyRecord = LegacyNote::query()
        ->where('workspace_id', $workspace->id)
        ->where('legacy_note_id', 101)
        ->first();
    expect($legacyRecord)->not()->toBeNull();
    expect($legacyRecord?->note_id)->toBe($plan?->id);
    expect(data_get($legacyRecord?->legacy_note_payload, 'slug'))->toBe('Projects/Alpha/Plan');
    expect(is_array($legacyRecord?->legacy_blocks))->toBeTrue();

    $workspace->refresh();
    expect($workspace->mention_suggestions)->toContain('Lea');
    expect($workspace->hashtag_suggestions)->toContain('work');
});

test('converter parses markdown task metadata and list priority without block metadata', function () {
    $converter = app(LegacyMarkdownToTiptapConverter::class);

    $markdown = "- [x] !!! ==Close item== >>2026-03-15 @Ops #urgent\n- !! Follow-up >2026-03-12";
    $blocks = [
        [
            'type' => 'list_block',
            'path' => 'b_1',
            'markdown' => $markdown,
            'meta' => '{}',
        ],
    ];

    $result = $converter->convert(
        $markdown,
        $blocks,
        [],
        false,
    );

    $taskItem = data_get($result, 'document.content.0.content.0');
    $listItem = data_get($result, 'document.content.1.content.0');

    expect(data_get($taskItem, 'type'))->toBe('taskItem');
    expect(data_get($taskItem, 'attrs.checked'))->toBeTrue();
    expect(data_get($taskItem, 'attrs.priority'))->toBe('high');
    expect(data_get($taskItem, 'attrs.deadlineDate'))->toBe('2026-03-15');
    expect(data_get($taskItem, 'content.0.content.0.marks.0.type'))->toBe('highlight');
    expect((string) data_get($taskItem, 'content.0.content.0.text'))->not->toContain('!!!');
    expect((string) data_get($taskItem, 'content.0.content.0.text'))->not->toContain('>>2026-03-15');

    expect(data_get($listItem, 'type'))->toBe('listItem');
    expect(data_get($listItem, 'attrs.priority'))->toBe('medium');
    expect(data_get($result, 'metrics.tasks_total'))->toBe(1);
    expect(data_get($result, 'metrics.tasks_closed'))->toBe(1);
    expect(data_get($result, 'metrics.mentions'))->toBe(1);
    expect(data_get($result, 'metrics.hashtags'))->toBe(1);
});

test('converter marks unresolved wiki-links with red highlight', function () {
    $converter = app(LegacyMarkdownToTiptapConverter::class);

    $markdown = 'Check unresolved [[Missing/Note|Missing Note]] link.';
    $blocks = [
        [
            'type' => 'paragraph',
            'path' => 'b_1',
            'markdown' => $markdown,
            'meta' => '{}',
        ],
    ];

    $result = $converter->convert(
        $markdown,
        $blocks,
        [],
        false,
    );

    $paragraphContent = (array) data_get($result, 'document.content.0.content', []);
    $highlightedNode = collect($paragraphContent)->first(function ($node): bool {
        return data_get($node, 'type') === 'text'
            && data_get($node, 'text') === '[[Missing/Note|Missing Note]]';
    });

    expect($highlightedNode)->not->toBeNull();
    expect(data_get($highlightedNode, 'marks.0.type'))->toBe('highlight');
    expect(data_get($highlightedNode, 'marks.0.attrs.color'))->toBe('var(--tt-color-highlight-red)');
    expect(data_get($result, 'unresolved_wikilinks'))->toContain('Missing/Note');
});

test('legacy import can clear workspace before importing', function () {
    $user = User::factory()->create();
    $workspace = $user->currentWorkspace();

    expect($workspace)->not()->toBeNull();

    $existing = Note::factory()->create([
        'workspace_id' => $workspace->id,
        'title' => 'Existing note that should be removed',
        'slug' => 'existing/note',
    ]);

    $notesFile = storage_path('framework/testing/legacy-notes-clear-test.json');
    $blocksFile = storage_path('framework/testing/legacy-note-blocks-clear-test.json');
    File::ensureDirectoryExists(dirname($notesFile));

    $notesPayload = [
        [
            'id' => 501,
            'team_id' => 1,
            'slug' => 'Imported/One',
            'title' => 'Imported One',
            'markdown' => "# Imported One\n\nBody",
            'frontmatter' => '{}',
            'content_hash' => 'hash-imported-one',
            'created_at' => '2026-03-09 10:00:00',
            'updated_at' => '2026-03-09 10:00:00',
            'deleted_at' => null,
        ],
    ];

    $blocksPayload = [
        [
            'id' => 1,
            'block_id' => 'b_imported_1',
            'note_slug' => 'Imported/One',
            'note_id' => 501,
            'team_id' => 1,
            'type' => 'heading',
            'location_id' => 'l_1_1::b_1',
            'path' => 'b_1',
            'range_start' => 1,
            'range_end' => 1,
            'markdown' => '# Imported One',
            'text' => 'Imported One',
            'meta' => '{"level":1}',
            'mentions' => '[]',
            'hashtags' => '[]',
            'wikilinks' => '[]',
        ],
    ];

    file_put_contents($notesFile, json_encode($notesPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    file_put_contents($blocksFile, json_encode($blocksPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

    $this->artisan('notes:import-legacy', [
        '--workspace' => $workspace->id,
        '--notes' => Str::replaceFirst(base_path().'/', '', $notesFile),
        '--blocks' => Str::replaceFirst(base_path().'/', '', $blocksFile),
        '--clear-workspace' => true,
        '--force' => true,
    ])->assertExitCode(0);

    expect(Note::query()->where('id', $existing->id)->exists())->toBeFalse();
    expect(Note::query()->where('workspace_id', $workspace->id)->where('title', 'Imported One')->exists())->toBeTrue();
    expect(LegacyNote::query()->where('workspace_id', $workspace->id)->where('legacy_note_id', 501)->exists())->toBeTrue();
});
