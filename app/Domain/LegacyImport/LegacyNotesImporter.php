<?php

namespace App\Domain\LegacyImport;

use App\Models\LegacyNote;
use App\Models\Note;
use App\Models\Workspace;
use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteSlugService;
use App\Support\Notes\NoteTitleExtractor;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;

class LegacyNotesImporter
{
    public function __construct(
        private readonly JournalNoteService $journalNoteService,
        private readonly NoteSlugService $noteSlugService,
        private readonly NoteTitleExtractor $noteTitleExtractor,
        private readonly LegacyMarkdownToTiptapConverter $converter,
    ) {}

    /**
     * @return array{
     *   imported_notes: int,
     *   imported_journals: int,
     *   imported_legacy_rows: int,
     *   created_synthetic_notes: int,
     *   tasks_total: int,
     *   tasks_open: int,
     *   tasks_closed: int,
     *   normal_note_summaries: array<int, array{
     *      slug: string,
     *      tasks_total: int,
     *      tasks_open: int,
     *      tasks_closed: int,
     *      tasks_with_legacy_ids: int,
     *      wikilinks: int,
     *      mentions: int,
     *      hashtags: int
     *   }>,
     *   journal_note_summaries: array<int, array{
     *      slug: string,
     *      tasks_total: int,
     *      tasks_open: int,
     *      tasks_closed: int,
     *      tasks_with_legacy_ids: int,
     *      wikilinks: int,
     *      mentions: int,
     *      hashtags: int
     *   }>,
     *   unresolved_wikilinks: array<int, string>,
     *   unresolved_wikilink_details: array<int, array{
     *      slug: string,
     *      wikilink: string,
     *      raw_markdown: string,
     *      block_path: string
     *   }>,
     *   pipeline: array{
     *      markdown: array{
     *          tasks_total: int,
     *          tasks_open: int,
     *          tasks_closed: int,
     *          tasks_with_legacy_ids: int,
     *          wikilinks: int,
     *          mentions: int,
     *          hashtags: int
     *      },
     *      enrichment: array{
     *          task_blocks_available: int,
     *          task_ids_assigned: int,
     *          task_ids_missing: int
     *      }
     *   },
     *   task_id_check: array{
     *      tasks_total: int,
     *      task_ids_assigned: int,
     *      task_ids_missing: int,
     *      notes_with_missing_ids: array<int, array{slug: string, missing: int}>,
     *      missing_tasks: array<int, array{
     *         slug: string,
     *         block_id: string,
     *         raw_markdown: string,
     *         priority: string,
     *         mentions: string,
     *         hashtags: string,
     *         wikilinks: string,
     *         due_date: string,
     *         deadline_date: string
     *      }>
     *   },
     * }
     */
    public function import(
        Workspace $workspace,
        string $notesPath,
        string $blocksPath,
        bool $skipWiki = false,
        bool $dryRun = false,
        ?callable $progress = null,
    ): array {
        $legacyNotes = $this->loadJsonArray($notesPath);
        $legacyBlocks = $this->loadJsonArray($blocksPath);

        $blocksBySlug = collect($legacyBlocks)
            ->filter(fn ($row) => is_array($row))
            ->groupBy(fn (array $row) => (string) ($row['note_slug'] ?? ''));

        $pathKeyToNote = $this->existingPathKeyMap($workspace);
        $legacyReferenceBySlug = [];
        $createdSyntheticNotes = 0;
        $importedNotes = 0;
        $importedJournals = 0;
        $workspaceMentions = $this->normalizeSuggestionList($workspace->mention_suggestions);
        $workspaceHashtags = $this->normalizeSuggestionList($workspace->hashtag_suggestions);
        $unresolvedWikiLinks = [];
        $unresolvedWikiLinkDetails = [];
        $tasksTotal = 0;
        $tasksOpen = 0;
        $tasksClosed = 0;
        $normalNoteSummaries = [];
        $journalNoteSummaries = [];
        $noteTypeBySlug = [];
        $markdownPhaseTotals = [
            'tasks_total' => 0,
            'tasks_open' => 0,
            'tasks_closed' => 0,
            'wikilinks' => 0,
            'mentions' => 0,
            'hashtags' => 0,
        ];
        $enrichmentPhaseTotals = [
            'task_blocks_available' => 0,
            'task_ids_assigned' => 0,
            'task_ids_missing' => 0,
        ];
        $notesWithMissingTaskIds = [];
        $missingTaskRows = [];

        /** @var Collection<int, array<string, mixed>> $activeLegacyNotes */
        $activeLegacyNotes = collect($legacyNotes)
            ->filter(fn ($row) => is_array($row))
            ->filter(fn (array $row) => empty($row['deleted_at']))
            ->values();

        $sortedByDepth = $activeLegacyNotes
            ->sortBy(fn (array $row) => substr_count((string) ($row['slug'] ?? ''), '/'))
            ->values();

        foreach ($sortedByDepth as $legacyRow) {
            $legacySlug = trim((string) ($legacyRow['slug'] ?? ''));
            if ($legacySlug === '') {
                continue;
            }

            $frontmatter = $this->decodeJsonField($legacyRow['frontmatter'] ?? null);
            $noteBlocks = $blocksBySlug->get($legacySlug, collect())->values()->all();
            $journalInfo = $this->resolveJournalInfo(
                $legacySlug,
                $frontmatter,
                (string) ($legacyRow['created_at'] ?? ''),
            );
            $noteTypeBySlug[$legacySlug] = $journalInfo !== null ? 'journal' : 'note';

            if ($journalInfo !== null) {
                if ($dryRun) {
                    $legacyReferenceBySlug[$legacySlug] = [
                        'id' => $legacySlug,
                        'href' => "/notes/legacy/{$legacySlug}",
                    ];
                    $importedJournals++;

                    continue;
                }

                $note = $this->journalNoteService->resolveOrCreate(
                    $workspace,
                    $journalInfo['granularity'],
                    $this->journalNoteService->periodFor(
                        $journalInfo['granularity'],
                        $journalInfo['date'],
                    ),
                    'nl',
                    null,
                    true,
                );

                $note->properties = $this->buildLegacyProperties(
                    $note->properties,
                    $legacySlug,
                    $frontmatter,
                    false,
                );
                $note->save();

                $legacyReferenceBySlug[$legacySlug] = [
                    'id' => $note->id,
                    'href' => $this->noteSlugService->urlFor($note),
                ];

                $this->storeLegacySnapshot(
                    $workspace,
                    $note,
                    $legacyRow,
                    $noteBlocks,
                    $frontmatter,
                );

                $importedJournals++;

                continue;
            }

            $segments = array_values(array_filter(explode('/', $legacySlug), fn (string $segment) => $segment !== ''));
            if ($segments === []) {
                continue;
            }

            $parentPath = '';
            for ($i = 0; $i < count($segments) - 1; $i++) {
                $segment = $segments[$i];
                $parentPath = $parentPath === '' ? $segment : "{$parentPath}/{$segment}";

                if (isset($pathKeyToNote[$parentPath])) {
                    continue;
                }

                if ($dryRun) {
                    $legacyReferenceBySlug[$parentPath] = [
                        'id' => $parentPath,
                        'href' => "/notes/legacy/{$parentPath}",
                    ];
                    $createdSyntheticNotes++;

                    continue;
                }

                $parentParentPath = $this->parentPath($parentPath);
                $parentParent = $parentParentPath !== '' ? ($pathKeyToNote[$parentParentPath] ?? null) : null;
                $syntheticTitle = $this->segmentToTitle($segment);
                $syntheticContent = $this->defaultNoteContentFromTitle($syntheticTitle);

                $synthetic = $workspace->notes()->create([
                    'type' => Note::TYPE_NOTE,
                    'title' => $syntheticTitle,
                    'parent_id' => $parentParent?->id,
                    'content' => $syntheticContent,
                    'properties' => $this->buildLegacyProperties(
                        [],
                        $parentPath,
                        [],
                        true,
                    ),
                ]);

                $this->noteSlugService->syncSingleNote($synthetic);
                $pathKeyToNote[$parentPath] = $synthetic->fresh();
                $legacyReferenceBySlug[$parentPath] = [
                    'id' => $synthetic->id,
                    'href' => $this->noteSlugService->urlFor($synthetic),
                ];
                $createdSyntheticNotes++;
            }

            $legacyPathKey = $legacySlug;
            if ($dryRun) {
                $legacyReferenceBySlug[$legacyPathKey] = [
                    'id' => $legacyPathKey,
                    'href' => "/notes/legacy/{$legacyPathKey}",
                ];
                $importedNotes++;

                continue;
            }

            $existing = $pathKeyToNote[$legacyPathKey] ?? null;

            $title = $this->resolveLegacyTitle($legacyRow, $segments);
            $parent = count($segments) > 1
                ? ($pathKeyToNote[implode('/', array_slice($segments, 0, -1))] ?? null)
                : null;

            if (! $existing || $existing->type !== Note::TYPE_NOTE) {
                $noteContent = $this->defaultNoteContentFromTitle($title);
                $existing = $workspace->notes()->create([
                    'type' => Note::TYPE_NOTE,
                    'title' => $title,
                    'parent_id' => $parent?->id,
                    'content' => $noteContent,
                    'properties' => $this->buildLegacyProperties(
                        [],
                        $legacyPathKey,
                        $frontmatter,
                        false,
                    ),
                ]);
            } else {
                $existing->title = $title;
                $existing->parent_id = $parent?->id;
                if (! is_array($existing->content) || ($existing->content['type'] ?? null) !== 'doc') {
                    $existing->content = $this->defaultNoteContentFromTitle($title);
                }
                $existing->properties = $this->buildLegacyProperties(
                    $existing->properties,
                    $legacyPathKey,
                    $frontmatter,
                    false,
                );
                $existing->save();
            }

            $this->noteSlugService->syncSingleNote($existing);
            $pathKeyToNote[$legacyPathKey] = $existing->fresh();
            $legacyReferenceBySlug[$legacyPathKey] = [
                'id' => $existing->id,
                'href' => $this->noteSlugService->urlFor($existing),
            ];

            $this->storeLegacySnapshot(
                $workspace,
                $existing,
                $legacyRow,
                $noteBlocks,
                $frontmatter,
            );

            $importedNotes++;
        }

        foreach ($activeLegacyNotes as $legacyRow) {
            $legacySlug = trim((string) ($legacyRow['slug'] ?? ''));
            $reference = $legacyReferenceBySlug[$legacySlug] ?? null;
            if (! $reference) {
                continue;
            }

            $noteBlocks = $blocksBySlug->get($legacySlug, collect())->values()->all();
            $conversion = $this->converter->convert(
                (string) ($legacyRow['markdown'] ?? ''),
                is_array($noteBlocks) ? $noteBlocks : [],
                $legacyReferenceBySlug,
                $skipWiki,
            );

            $metrics = $conversion['metrics'];
            $tasksTotal += $metrics['tasks_total'];
            $tasksOpen += $metrics['tasks_open'];
            $tasksClosed += $metrics['tasks_closed'];

            $summary = [
                'slug' => $legacySlug,
                ...$metrics,
            ];
            $missingTaskIds = max(0, ((int) $metrics['tasks_total']) - ((int) ($metrics['tasks_with_legacy_ids'] ?? 0)));
            if ($missingTaskIds > 0) {
                $notesWithMissingTaskIds[] = [
                    'slug' => $legacySlug,
                    'missing' => $missingTaskIds,
                ];
            }

            if (($noteTypeBySlug[$legacySlug] ?? 'note') === 'journal') {
                $journalNoteSummaries[] = $summary;
            } else {
                $normalNoteSummaries[] = $summary;
            }

            $markdownPhase = $conversion['pipeline']['markdown'];
            $enrichmentPhase = $conversion['pipeline']['enrichment'];
            $markdownPhaseTotals['tasks_total'] += $markdownPhase['tasks_total'];
            $markdownPhaseTotals['tasks_open'] += $markdownPhase['tasks_open'];
            $markdownPhaseTotals['tasks_closed'] += $markdownPhase['tasks_closed'];
            $markdownPhaseTotals['wikilinks'] += $markdownPhase['wikilinks'];
            $markdownPhaseTotals['mentions'] += $markdownPhase['mentions'];
            $markdownPhaseTotals['hashtags'] += $markdownPhase['hashtags'];
            $enrichmentPhaseTotals['task_blocks_available'] += $enrichmentPhase['task_blocks_available'];
            $enrichmentPhaseTotals['task_ids_assigned'] += $enrichmentPhase['task_ids_assigned'];
            $enrichmentPhaseTotals['task_ids_missing'] += $enrichmentPhase['task_ids_missing'];
            foreach (($enrichmentPhase['missing_tasks'] ?? []) as $missingTask) {
                if (! is_array($missingTask)) {
                    continue;
                }

                $line = trim((string) ($missingTask['raw_markdown'] ?? ''));
                if ($line === '') {
                    continue;
                }

                $missingTaskRows[] = [
                    'slug' => $legacySlug,
                    'block_id' => trim((string) ($missingTask['block_id'] ?? '')),
                    'raw_markdown' => $line,
                    'priority' => trim((string) ($missingTask['priority'] ?? '')),
                    'mentions' => implode(', ', array_values(array_filter(
                        (array) ($missingTask['mentions'] ?? []),
                        fn (mixed $item): bool => is_string($item) && trim($item) !== '',
                    ))),
                    'hashtags' => implode(', ', array_values(array_filter(
                        (array) ($missingTask['hashtags'] ?? []),
                        fn (mixed $item): bool => is_string($item) && trim($item) !== '',
                    ))),
                    'wikilinks' => implode(', ', array_values(array_filter(
                        (array) ($missingTask['wikilinks'] ?? []),
                        fn (mixed $item): bool => is_string($item) && trim($item) !== '',
                    ))),
                    'due_date' => trim((string) ($missingTask['due_date'] ?? '')),
                    'deadline_date' => trim((string) ($missingTask['deadline_date'] ?? '')),
                ];
            }

            if (! $dryRun) {
                /** @var Note|null $note */
                $note = Note::query()->find($reference['id']);
                if (! $note) {
                    continue;
                }

                $note->content = $conversion['document'];
                if ($note->type !== Note::TYPE_JOURNAL) {
                    $note->title = $this->noteTitleExtractor->extract($conversion['document']) ?: $note->title;
                    $this->noteSlugService->syncSingleNote($note);
                }
                $note->save();
            }

            $workspaceMentions = $this->mergeSuggestions(
                $workspaceMentions,
                $conversion['mentions'],
            );
            $workspaceHashtags = $this->mergeSuggestions(
                $workspaceHashtags,
                $conversion['hashtags'],
            );
            $unresolvedDetails = $this->collectUnresolvedWikiLinkDetails(
                $legacySlug,
                is_array($noteBlocks) ? $noteBlocks : [],
                $legacyReferenceBySlug,
            );
            if ($unresolvedDetails !== []) {
                $unresolvedWikiLinkDetails = [...$unresolvedWikiLinkDetails, ...$unresolvedDetails];
            }
            $unresolvedWikiLinks = array_values(array_unique([
                ...$unresolvedWikiLinks,
                ...$conversion['unresolved_wikilinks'],
            ]));
        }

        $unresolvedWikiLinks = array_values(array_unique([
            ...$unresolvedWikiLinks,
            ...collect($unresolvedWikiLinkDetails)
                ->map(fn (array $item): string => (string) ($item['wikilink'] ?? ''))
                ->filter(fn (string $target): bool => $target !== '')
                ->values()
                ->all(),
        ]));
        $unresolvedWikiLinkDetails = collect($unresolvedWikiLinkDetails)
            ->unique(fn (array $item): string => sprintf(
                '%s|%s',
                (string) ($item['slug'] ?? ''),
                (string) ($item['wikilink'] ?? ''),
            ))
            ->values()
            ->all();

        if (! $dryRun) {
            $workspace->mention_suggestions = $workspaceMentions;
            $workspace->hashtag_suggestions = $workspaceHashtags;
            $workspace->save();
        }

        if (is_callable($progress)) {
            $progress('markdown', $markdownPhaseTotals);
            $progress('enrichment', $enrichmentPhaseTotals);
        }

        usort($notesWithMissingTaskIds, function (array $a, array $b): int {
            return $b['missing'] <=> $a['missing'];
        });
        $missingTaskRows = collect($missingTaskRows)
            ->unique(fn (array $item): string => sprintf(
                '%s|%s|%s|%s|%s|%s|%s|%s',
                (string) ($item['slug'] ?? ''),
                (string) ($item['block_id'] ?? ''),
                (string) ($item['raw_markdown'] ?? ''),
                (string) ($item['priority'] ?? ''),
                (string) ($item['mentions'] ?? ''),
                (string) ($item['hashtags'] ?? ''),
                (string) ($item['wikilinks'] ?? ''),
                (string) ($item['due_date'] ?? '').'|'.(string) ($item['deadline_date'] ?? ''),
            ))
            ->values()
            ->all();

        return [
            'imported_notes' => $importedNotes,
            'imported_journals' => $importedJournals,
            'imported_legacy_rows' => $activeLegacyNotes->count(),
            'created_synthetic_notes' => $createdSyntheticNotes,
            'tasks_total' => $tasksTotal,
            'tasks_open' => $tasksOpen,
            'tasks_closed' => $tasksClosed,
            'normal_note_summaries' => collect($normalNoteSummaries)
                ->sortBy(fn (array $item) => strtolower($item['slug']))
                ->values()
                ->all(),
            'journal_note_summaries' => collect($journalNoteSummaries)
                ->sortBy(fn (array $item) => strtolower($item['slug']))
                ->values()
                ->all(),
            'unresolved_wikilinks' => $unresolvedWikiLinks,
            'unresolved_wikilink_details' => $unresolvedWikiLinkDetails,
            'pipeline' => [
                'markdown' => $markdownPhaseTotals,
                'enrichment' => $enrichmentPhaseTotals,
            ],
            'task_id_check' => [
                'tasks_total' => $tasksTotal,
                'task_ids_assigned' => $enrichmentPhaseTotals['task_ids_assigned'],
                'task_ids_missing' => max(0, $tasksTotal - $enrichmentPhaseTotals['task_ids_assigned']),
                'notes_with_missing_ids' => $notesWithMissingTaskIds,
                'missing_tasks' => $missingTaskRows,
            ],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $blocks
     * @return array{
     *   tasks_total: int,
     *   tasks_open: int,
     *   tasks_closed: int,
     *   wikilinks: int,
     *   mentions: int,
     *   hashtags: int
     * }
     */
    private function metricsFromLegacyBlocks(array $blocks): array
    {
        $tasksTotal = 0;
        $tasksOpen = 0;
        $tasksClosed = 0;
        $wikilinks = [];
        $mentions = [];
        $hashtags = [];

        foreach ($blocks as $block) {
            if (! is_array($block)) {
                continue;
            }

            foreach ($this->decodeJsonList($block['mentions'] ?? null) as $mention) {
                if (is_string($mention) && trim($mention) !== '') {
                    $mentions[] = trim($mention);
                }
            }

            foreach ($this->decodeJsonList($block['hashtags'] ?? null) as $hashtag) {
                if (is_string($hashtag) && trim($hashtag) !== '') {
                    $hashtags[] = trim($hashtag);
                }
            }

            foreach ($this->decodeJsonList($block['wikilinks'] ?? null) as $link) {
                if (! is_array($link)) {
                    continue;
                }

                $wikilinks[] = json_encode([
                    'raw' => (string) ($link['raw'] ?? ''),
                    'target' => (string) ($link['target'] ?? ''),
                    'title' => (string) ($link['title'] ?? ''),
                ]);
            }

            if (($block['type'] ?? null) !== 'task_item') {
                continue;
            }

            $tasksTotal++;
            $meta = $this->decodeJsonField($block['meta'] ?? null);
            $task = Arr::get($meta, 'task', []);

            $status = strtolower(trim((string) ($task['status'] ?? '')));
            $checkbox = strtolower(trim((string) ($task['checkbox'] ?? '')));
            $isClosed = $status === 'done' || $checkbox === 'x';
            if ($isClosed) {
                $tasksClosed++;
            } else {
                $tasksOpen++;
            }
        }

        return [
            'tasks_total' => $tasksTotal,
            'tasks_open' => $tasksOpen,
            'tasks_closed' => $tasksClosed,
            'wikilinks' => count(array_values(array_unique($wikilinks))),
            'mentions' => count(array_values(array_unique($mentions))),
            'hashtags' => count(array_values(array_unique($hashtags))),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function loadJsonArray(string $path): array
    {
        if (! is_file($path)) {
            throw new \RuntimeException("File not found: {$path}");
        }

        $raw = file_get_contents($path);
        if (! is_string($raw)) {
            throw new \RuntimeException("Unable to read file: {$path}");
        }

        $decoded = json_decode($raw, true);
        if (! is_array($decoded)) {
            throw new \RuntimeException("Invalid JSON array in: {$path}");
        }

        return $decoded;
    }

    /**
     * @return array<string, Note>
     */
    private function existingPathKeyMap(Workspace $workspace): array
    {
        $map = [];
        $notes = $workspace->notes()->get(['id', 'slug', 'title', 'type', 'parent_id', 'properties']);

        foreach ($notes as $note) {
            $pathKey = trim((string) data_get($note->properties, 'legacy_path_key'));
            if ($pathKey === '') {
                continue;
            }

            $map[$pathKey] = $note;
        }

        return $map;
    }

    /**
     * @param  array<string, mixed>|null  $current
     * @param  array<string, mixed>  $frontmatter
     * @return array<string, mixed>
     */
    private function buildLegacyProperties(
        mixed $current,
        string $legacyPathKey,
        array $frontmatter,
        bool $synthetic,
    ): array {
        $base = is_array($current) ? $current : [];
        $base['legacy_path_key'] = $legacyPathKey;
        $base['legacy_synthetic_folder'] = $synthetic;
        $base['legacy_frontmatter'] = $frontmatter;

        foreach ($frontmatter as $key => $value) {
            if (! is_string($key) || $key === '') {
                continue;
            }

            if (is_scalar($value) || $value === null) {
                $base[$key] = is_scalar($value) ? (string) $value : '';
            }
        }

        return $base;
    }

    /**
     * @param  array<string, mixed>  $legacyRow
     * @param  array<int, array<string, mixed>>  $legacyBlocks
     * @param  array<string, mixed>  $frontmatter
     */
    private function storeLegacySnapshot(
        Workspace $workspace,
        Note $note,
        array $legacyRow,
        array $legacyBlocks,
        array $frontmatter,
    ): void {
        LegacyNote::query()->updateOrCreate(
            [
                'workspace_id' => $workspace->id,
                'legacy_team_id' => Arr::get($legacyRow, 'team_id'),
                'legacy_note_id' => Arr::get($legacyRow, 'id'),
            ],
            [
                'note_id' => $note->id,
                'legacy_slug' => (string) Arr::get($legacyRow, 'slug', ''),
                'legacy_hash' => Arr::get($legacyRow, 'content_hash'),
                'legacy_note_payload' => $legacyRow,
                'legacy_frontmatter_raw' => is_string(Arr::get($legacyRow, 'frontmatter'))
                    ? Arr::get($legacyRow, 'frontmatter')
                    : null,
                'legacy_frontmatter' => $frontmatter,
                'legacy_blocks' => $legacyBlocks,
                'imported_at' => now(),
            ],
        );
    }

    /**
     * @param  array<int, string>  $segments
     */
    private function resolveLegacyTitle(array $legacyRow, array $segments): string
    {
        $explicit = trim((string) ($legacyRow['title'] ?? ''));
        if ($explicit !== '') {
            return $explicit;
        }

        $markdown = (string) ($legacyRow['markdown'] ?? '');
        if (preg_match('/^\s*#\s+(.+)$/m', $markdown, $match) === 1) {
            $fromHeading = trim((string) $match[1]);
            if ($fromHeading !== '') {
                return $fromHeading;
            }
        }

        $last = (string) end($segments);

        return $this->segmentToTitle($last);
    }

    private function segmentToTitle(string $segment): string
    {
        $value = trim(str_replace(['-', '_'], ' ', $segment));

        return $value !== '' ? $value : 'Untitled';
    }

    private function parentPath(string $path): string
    {
        $segments = explode('/', $path);
        array_pop($segments);

        return implode('/', $segments);
    }

    /**
     * @return array<string, mixed>
     */
    private function defaultNoteContentFromTitle(string $title): array
    {
        return [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'heading',
                    'attrs' => ['level' => 1],
                    'content' => [
                        ['type' => 'text', 'text' => $title],
                    ],
                ],
            ],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $frontmatter
     * @return array{granularity: string, date: CarbonImmutable}|null
     */
    private function resolveJournalInfo(
        string $slug,
        array $frontmatter,
        string $createdAt,
    ): ?array {
        if (! str_starts_with($slug, 'journals/')) {
            return null;
        }

        if (preg_match('/^journals\/\d{4}\/\d{2}\/(\d{4}-\d{2}-\d{2})$/', $slug, $match) === 1) {
            return [
                'granularity' => Note::JOURNAL_DAILY,
                'date' => CarbonImmutable::parse($match[1]),
            ];
        }

        if (preg_match('/^journals\/(\d{4})$/', $slug, $match) === 1) {
            return [
                'granularity' => Note::JOURNAL_YEARLY,
                'date' => CarbonImmutable::create((int) $match[1], 1, 1)->startOfYear(),
            ];
        }

        if (preg_match('/^journals\/(\d{4})\/(\d{2})$/', $slug, $match) === 1) {
            return [
                'granularity' => Note::JOURNAL_MONTHLY,
                'date' => CarbonImmutable::create((int) $match[1], (int) $match[2], 1)->startOfMonth(),
            ];
        }

        if (preg_match('/^journals\/(\d{4})-W(\d{2})$/', $slug, $match) === 1) {
            return [
                'granularity' => Note::JOURNAL_WEEKLY,
                'date' => CarbonImmutable::now()->setISODate((int) $match[1], (int) $match[2])->startOfWeek(),
            ];
        }

        $type = strtolower(trim((string) Arr::get($frontmatter, 'type', '')));
        if (in_array($type, ['daily-note', 'weekly-note', 'monthly-note', 'yearly-note'], true)) {
            $date = $createdAt !== '' ? CarbonImmutable::parse($createdAt) : CarbonImmutable::now();
            $granularity = match ($type) {
                'weekly-note' => Note::JOURNAL_WEEKLY,
                'monthly-note' => Note::JOURNAL_MONTHLY,
                'yearly-note' => Note::JOURNAL_YEARLY,
                default => Note::JOURNAL_DAILY,
            };

            $date = match ($granularity) {
                Note::JOURNAL_WEEKLY => $date->startOfWeek(),
                Note::JOURNAL_MONTHLY => $date->startOfMonth(),
                Note::JOURNAL_YEARLY => $date->startOfYear(),
                default => $date->startOfDay(),
            };

            return [
                'granularity' => $granularity,
                'date' => $date,
            ];
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJsonField(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    /**
     * @return array<int, mixed>
     */
    private function decodeJsonList(mixed $value): array
    {
        if (is_array($value)) {
            return array_values($value);
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        if (! is_array($decoded)) {
            return [];
        }

        return array_values($decoded);
    }

    /**
     * @return array<int, string>
     */
    private function normalizeSuggestionList(mixed $current): array
    {
        if (! is_array($current)) {
            return [];
        }

        return collect($current)
            ->filter(fn ($item) => is_string($item))
            ->map(fn (string $item) => trim($item))
            ->filter(fn (string $item) => $item !== '')
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $existing
     * @param  array<int, string>  $added
     * @return array<int, string>
     */
    private function mergeSuggestions(array $existing, array $added): array
    {
        $merged = $existing;

        foreach ($added as $item) {
            $clean = trim($item);
            if ($clean === '') {
                continue;
            }

            $exists = collect($merged)
                ->contains(fn (string $entry) => mb_strtolower($entry) === mb_strtolower($clean));
            if (! $exists) {
                $merged[] = $clean;
            }
        }

        usort($merged, fn (string $a, string $b): int => strcasecmp($a, $b));

        return array_values($merged);
    }

    /**
     * @param  array<int, array<string, mixed>>  $noteBlocks
     * @param  array<string, array{id: string, href: string}>  $legacyReferenceBySlug
     * @return array<int, array{slug: string, wikilink: string, raw_markdown: string, block_path: string}>
     */
    private function collectUnresolvedWikiLinkDetails(
        string $legacySlug,
        array $noteBlocks,
        array $legacyReferenceBySlug,
    ): array {
        $bestByTarget = [];

        foreach ($noteBlocks as $block) {
            if (! is_array($block)) {
                continue;
            }

            $rawMarkdown = (string) ($block['markdown'] ?? '');
            if (trim($rawMarkdown) === '') {
                continue;
            }

            $blockPath = trim((string) ($block['path'] ?? ''));
            $specificity = substr_count($blockPath, '.') + mb_strlen($rawMarkdown, 'UTF-8') * -0.001;

            $targets = collect($this->decodeJsonList($block['wikilinks'] ?? null))
                ->map(fn (mixed $item): string => trim((string) (is_array($item) ? ($item['target'] ?? '') : '')))
                ->filter(fn (string $target): bool => $target !== '')
                ->values()
                ->all();

            if ($targets === []) {
                $unescapedMarkdown = str_replace(['\\[\\[', '\\]\\]'], ['[[', ']]'], $rawMarkdown);
                $withoutInlineCode = preg_replace('/`[^`\n]*`/u', '', $unescapedMarkdown) ?? $unescapedMarkdown;
                preg_match_all('/\[\[([^\]\|\n]+)(?:\|([^\]\n]+))?\]\]/u', $withoutInlineCode, $matches, PREG_SET_ORDER);
                $targets = collect($matches)
                    ->map(fn (array $match): string => trim((string) ($match[1] ?? '')))
                    ->filter(fn (string $target): bool => $target !== '')
                    ->values()
                    ->all();
            }

            foreach ($targets as $target) {
                if (isset($legacyReferenceBySlug[$target])) {
                    continue;
                }

                if (str_contains($target, '`')) {
                    continue;
                }

                $existing = $bestByTarget[$target] ?? null;
                if (is_array($existing) && ((float) ($existing['_score'] ?? 0.0) >= $specificity)) {
                    continue;
                }

                $bestByTarget[$target] = [
                    'slug' => $legacySlug,
                    'wikilink' => $target,
                    'raw_markdown' => $rawMarkdown,
                    'block_path' => $blockPath,
                    '_score' => $specificity,
                ];
            }
        }

        return collect($bestByTarget)
            ->values()
            ->map(function (array $item): array {
                unset($item['_score']);

                return $item;
            })
            ->all();
    }
}
