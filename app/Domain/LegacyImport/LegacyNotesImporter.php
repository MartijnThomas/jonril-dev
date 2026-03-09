<?php

namespace App\Domain\LegacyImport;

use App\Models\LegacyNote;
use App\Models\Note;
use App\Models\Workspace;
use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteSlugService;
use App\Support\Notes\NoteTitleExtractor;
use App\Support\Notes\NoteWordCountExtractor;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;

class LegacyNotesImporter
{
    public function __construct(
        private readonly JournalNoteService $journalNoteService,
        private readonly NoteSlugService $noteSlugService,
        private readonly NoteTitleExtractor $noteTitleExtractor,
        private readonly NoteWordCountExtractor $noteWordCountExtractor,
        private readonly LegacyMarkdownToTiptapConverter $converter,
    ) {}

    /**
     * @return array{
     *   imported_notes: int,
     *   imported_journals: int,
     *   imported_legacy_rows: int,
     *   created_synthetic_notes: int,
     *   unresolved_wikilinks: array<int, string>
     * }
     */
    public function import(
        Workspace $workspace,
        string $notesPath,
        string $blocksPath,
        bool $skipWiki = false,
        bool $dryRun = false,
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
            $journalInfo = $this->resolveJournalInfo(
                $legacySlug,
                $frontmatter,
                (string) ($legacyRow['created_at'] ?? ''),
            );

            if ($journalInfo !== null) {
                if ($dryRun) {
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
                    $blocksBySlug->get($legacySlug, collect())->values()->all(),
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
                    $createdSyntheticNotes++;

                    continue;
                }

                $parentParentPath = $this->parentPath($parentPath);
                $parentParent = $parentParentPath !== '' ? ($pathKeyToNote[$parentParentPath] ?? null) : null;

                $synthetic = $workspace->notes()->create([
                    'type' => Note::TYPE_NOTE,
                    'title' => $this->segmentToTitle($segment),
                    'parent_id' => $parentParent?->id,
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

            if ($dryRun) {
                $importedNotes++;

                continue;
            }

            $legacyPathKey = $legacySlug;
            $existing = $pathKeyToNote[$legacyPathKey] ?? null;

            $title = $this->resolveLegacyTitle($legacyRow, $segments);
            $parent = count($segments) > 1
                ? ($pathKeyToNote[implode('/', array_slice($segments, 0, -1))] ?? null)
                : null;

            if (! $existing || $existing->type !== Note::TYPE_NOTE) {
                $existing = $workspace->notes()->create([
                    'type' => Note::TYPE_NOTE,
                    'title' => $title,
                    'parent_id' => $parent?->id,
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
                $blocksBySlug->get($legacySlug, collect())->values()->all(),
                $frontmatter,
            );

            $importedNotes++;
        }

        if (! $dryRun) {
            foreach ($activeLegacyNotes as $legacyRow) {
                $legacySlug = trim((string) ($legacyRow['slug'] ?? ''));
                $reference = $legacyReferenceBySlug[$legacySlug] ?? null;
                if (! $reference) {
                    continue;
                }

                /** @var Note|null $note */
                $note = Note::query()->find($reference['id']);
                if (! $note) {
                    continue;
                }

                $noteBlocks = $blocksBySlug->get($legacySlug, collect())->values()->all();
                $conversion = $this->converter->convert(
                    (string) ($legacyRow['markdown'] ?? ''),
                    is_array($noteBlocks) ? $noteBlocks : [],
                    $legacyReferenceBySlug,
                    $skipWiki,
                );

                $note->content = $conversion['document'];
                if ($note->type !== Note::TYPE_JOURNAL) {
                    $note->title = $this->noteTitleExtractor->extract($conversion['document']) ?: $note->title;
                    $this->noteSlugService->syncSingleNote($note);
                }
                $note->word_count = $this->noteWordCountExtractor->count($conversion['document']);
                $note->save();

                $workspaceMentions = $this->mergeSuggestions(
                    $workspaceMentions,
                    $conversion['mentions'],
                );
                $workspaceHashtags = $this->mergeSuggestions(
                    $workspaceHashtags,
                    $conversion['hashtags'],
                );
                $unresolvedWikiLinks = array_values(array_unique([
                    ...$unresolvedWikiLinks,
                    ...$conversion['unresolved_wikilinks'],
                ]));
            }

            $workspace->mention_suggestions = $workspaceMentions;
            $workspace->hashtag_suggestions = $workspaceHashtags;
            $workspace->save();
        }

        return [
            'imported_notes' => $importedNotes,
            'imported_journals' => $importedJournals,
            'imported_legacy_rows' => $activeLegacyNotes->count(),
            'created_synthetic_notes' => $createdSyntheticNotes,
            'unresolved_wikilinks' => $unresolvedWikiLinks,
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
}
