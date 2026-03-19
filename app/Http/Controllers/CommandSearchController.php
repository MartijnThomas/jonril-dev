<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteHeading;
use App\Models\NoteTask;
use App\Models\Workspace;
use App\Support\Notes\NoteHeadingIndexer;
use App\Support\Notes\NoteSlugService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Meilisearch\Client;
use Meilisearch\Search\SearchResult;

class CommandSearchController extends Controller
{
    public function __construct(
        private readonly NoteHeadingIndexer $noteHeadingIndexer,
        private readonly NoteSlugService $noteSlugService,
    ) {}

    public function __invoke(Request $request, Workspace $workspace)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        abort_unless(
            $workspace->users()->where('users.id', $user->id)->exists(),
            403,
        );

        $workspaceIds = [$workspace->id];

        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:160'],
            'mode' => ['nullable', Rule::in(['notes', 'headings'])],
            'include_notes' => ['nullable', 'boolean'],
            'include_journal' => ['nullable', 'boolean'],
            'include_headings' => ['nullable', 'boolean'],
            'include_tasks' => ['nullable', 'boolean'],
            'task_statuses' => ['nullable', 'array'],
            'task_statuses.*' => [Rule::in(['open', 'in_progress', 'assigned', 'starred', 'deferred', 'migrated', 'closed', 'canceled'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $mode = $data['mode'] ?? 'notes';
        $query = trim((string) ($data['q'] ?? ''));
        $includeNotes = (bool) ($data['include_notes'] ?? true);
        $includeJournal = (bool) ($data['include_journal'] ?? false);
        $includeHeadings = (bool) ($data['include_headings'] ?? false);
        $includeTasks = (bool) ($data['include_tasks'] ?? false);
        $taskStatuses = collect($data['task_statuses'] ?? ['open', 'in_progress', 'assigned', 'starred', 'deferred'])
            ->filter(fn ($status) => is_string($status) && trim($status) !== '')
            ->map(fn (string $status) => trim(strtolower($status)))
            ->unique()
            ->values()
            ->all();
        $limit = (int) ($data['limit'] ?? 40);

        if ($mode === 'headings') {
            $this->ensureHeadingIndexBackfilled($workspaceIds);

            return response()->json([
                'mode' => 'headings',
                'items' => $this->searchHeadings(
                    workspaceIds: $workspaceIds,
                    query: $query,
                    includeJournal: $includeJournal,
                    limit: $limit,
                ),
            ]);
        }

        return response()->json([
            'mode' => 'notes',
            'items' => $this->searchNotes(
                workspaceIds: $workspaceIds,
                query: $query,
                includeNotes: $includeNotes,
                includeJournal: $includeJournal,
                includeHeadings: $includeHeadings,
                limit: $limit,
            ),
            'tasks' => $this->searchTasks(
                workspaceIds: $workspaceIds,
                query: $query,
                includeTasks: $includeTasks,
                taskStatuses: $taskStatuses,
                includeJournal: $includeJournal,
                limit: $limit,
            ),
        ]);
    }

    /**
     * @param  array<int, string>  $workspaceIds
     */
    private function ensureHeadingIndexBackfilled(array $workspaceIds): void
    {
        $hasAnyHeading = NoteHeading::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->exists();

        if ($hasAnyHeading) {
            return;
        }

        Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->select(['id', 'workspace_id', 'content'])
            ->orderBy('id')
            ->chunk(100, function ($notes): void {
                foreach ($notes as $note) {
                    $this->noteHeadingIndexer->reindexNote($note);
                }
            });
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array<string, mixed>>
     */
    private function searchNotes(
        array $workspaceIds,
        string $query,
        bool $includeNotes,
        bool $includeJournal,
        bool $includeHeadings,
        int $limit,
    ): array {
        if ($query === '') {
            return [];
        }
        if (! $includeNotes && ! $includeHeadings) {
            return [];
        }

        if ($this->usesMeilisearchDriver()) {
            return $this->matchingNotesViaMeilisearch(
                query: $query,
                workspaceIds: $workspaceIds,
                includeNotes: $includeNotes,
                includeJournal: $includeJournal,
                includeHeadings: $includeHeadings,
                limit: $limit,
                userLocale: $this->userLocaleForSearch(),
            );
        }

        $notes = Note::search($query)
            ->query(fn (Builder $queryBuilder) => $queryBuilder
                ->whereIn('workspace_id', $workspaceIds)
                ->when(! $includeJournal, fn (Builder $innerQueryBuilder) => $this->applyNoteTypeConstraint($innerQueryBuilder, false))
            )
            ->take($limit)
            ->get([
                'id',
                'workspace_id',
                'title',
                'slug',
                'type',
                'properties',
                'journal_granularity',
                'journal_date',
                'parent_id',
            ]);

        $journalIconSettings = $this->journalIconSettingsForUser();
        $userLocale = $this->userLocaleForSearch();

        return $notes
            ->map(function (Note $note) use ($journalIconSettings, $userLocale): array {
                $href = $this->noteSlugService->urlFor($note);
                [$icon, $iconColor] = $this->resolveNoteIconPayload($note, $journalIconSettings);

                return [
                    'id' => $note->id,
                    'title' => $note->display_title,
                    'href' => $href,
                    'slug' => $note->slug,
                    'path' => $this->notePathForCommandResult($note, $userLocale),
                    'type' => $note->type,
                    'journal_granularity' => $note->journal_granularity,
                    'icon' => $icon,
                    'icon_color' => $iconColor,
                    'icon_bg' => $note->icon_bg,
                    'match_source' => null,
                    'match_text' => null,
                    'match_block_id' => null,
                    'match_heading' => null,
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array<string, mixed>>
     */
    private function searchHeadings(
        array $workspaceIds,
        string $query,
        bool $includeJournal,
        int $limit,
    ): array {
        $headings = NoteHeading::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->whereHas('note', fn (Builder $noteQuery) => $this->applyNoteTypeConstraint($noteQuery, $includeJournal))
            ->when($query !== '', function (Builder $builder) use ($query): void {
                $builder->where(function (Builder $inner) use ($query): void {
                    $inner->where('text', 'like', "%{$query}%")
                        ->orWhereHas('note', function (Builder $noteQuery) use ($query): void {
                            $noteQuery->where('title', 'like', "%{$query}%")
                                ->orWhere('slug', 'like', "%{$query}%");
                        });
                });
            })
            ->with([
                'note:id,workspace_id,title,slug,type,properties,journal_granularity,journal_date,parent_id',
            ])
            ->orderByDesc('updated_at')
            ->limit($limit)
            ->get();

        $journalIconSettings = $this->journalIconSettingsForUser();
        $userLocale = $this->userLocaleForSearch();

        return $headings
            ->map(function (NoteHeading $heading) use ($journalIconSettings, $userLocale): ?array {
                $note = $heading->note;
                if (! $note) {
                    return null;
                }

                $href = $this->noteSlugService->urlFor($note);
                [$icon, $iconColor] = $this->resolveNoteIconPayload($note, $journalIconSettings);

                $blockId = (string) $heading->block_id;

                return [
                    'id' => (string) $heading->id,
                    'note_id' => (string) $note->id,
                    'heading_id' => $blockId,
                    'heading' => (string) $heading->text,
                    'level' => $heading->level,
                    'note_title' => $note->display_title,
                    'href' => "{$href}#{$blockId}",
                    'slug' => $note->slug,
                    'path' => $this->notePathForCommandResult($note, $userLocale),
                    'type' => $note->type,
                    'journal_granularity' => $note->journal_granularity,
                    'icon' => $icon,
                    'icon_color' => $iconColor,
                    'icon_bg' => $note->icon_bg,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array<string, mixed>>
     */
    private function searchTasks(
        array $workspaceIds,
        string $query,
        bool $includeTasks,
        array $taskStatuses,
        bool $includeJournal,
        int $limit,
    ): array {
        if (! $includeTasks || $query === '') {
            return [];
        }
        if ($taskStatuses === []) {
            return [];
        }

        if ($this->usesMeilisearchDriver()) {
            return $this->searchTasksViaMeilisearch(
                query: $query,
                workspaceIds: $workspaceIds,
                taskStatuses: $taskStatuses,
                includeJournal: $includeJournal,
                limit: $limit,
                userLocale: $this->userLocaleForSearch(),
            );
        }

        $tasks = $this->searchTasksViaDatabase($query, $workspaceIds, $taskStatuses, $includeJournal, $limit);

        if ($tasks->isEmpty()) {
            return [];
        }

        $noteIds = $tasks->pluck('note_id')
            ->filter(fn ($value) => is_string($value) && trim($value) !== '')
            ->unique()
            ->values()
            ->all();

        /** @var \Illuminate\Support\Collection<string, Note> $notesById */
        $notesById = Note::query()
            ->whereIn('id', $noteIds)
            ->get([
                'id',
                'workspace_id',
                'title',
                'slug',
                'type',
                'properties',
                'journal_granularity',
                'journal_date',
                'parent_id',
            ])
            ->keyBy('id');

        $journalIconSettings = $this->journalIconSettingsForUser();
        $userLocale = $this->userLocaleForSearch();

        return $tasks
            ->map(function (NoteTask $task) use ($notesById, $journalIconSettings, $userLocale): ?array {
                $note = $notesById->get((string) $task->note_id);
                if (! $note) {
                    return null;
                }

                $baseHref = $this->noteSlugService->urlFor($note);
                $href = is_string($task->block_id) && trim($task->block_id) !== ''
                    ? "{$baseHref}#{$task->block_id}"
                    : $baseHref;
                [$icon, $iconColor] = $this->resolveNoteIconPayload($note, $journalIconSettings);

                return [
                    'id' => (string) $task->id,
                    'note_id' => (string) $note->id,
                    'section_heading' => is_string($task->section_heading) && trim($task->section_heading) !== '' ? trim($task->section_heading) : null,
                    'title' => (string) ($task->content_text ?? ''),
                    'task_title' => (string) ($task->content_text ?? ''),
                    'note_title' => $note->display_title,
                    'note_href' => $baseHref,
                    'href' => $href,
                    'path' => $this->notePathForCommandResult($note, $userLocale),
                    'type' => $note->type,
                    'journal_granularity' => $note->journal_granularity,
                    'icon' => $icon,
                    'icon_color' => $iconColor,
                    'icon_bg' => $note->icon_bg,
                    'task_status' => $task->task_status,
                    'checked' => (bool) $task->checked,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    private function applyNoteTypeConstraint(Builder $noteQuery, bool $includeJournal): void
    {
        if ($includeJournal) {
            return;
        }

        $noteQuery->where(function (Builder $inner): void {
            $inner->whereNull('type')
                ->orWhere('type', '!=', Note::TYPE_JOURNAL);
        });
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array<string, mixed>>
     */
    private function matchingNotesViaMeilisearch(
        string $query,
        array $workspaceIds,
        bool $includeNotes,
        bool $includeJournal,
        bool $includeHeadings,
        int $limit,
        string $userLocale,
    ): array {
        $host = (string) config('scout.meilisearch.host', '');
        if ($host === '') {
            return [];
        }

        $client = new Client($host, config('scout.meilisearch.key'));
        $indexName = (string) config('scout.prefix', '').(new Note)->searchableAs();
        $options = [
            'limit' => max(1, min($limit, 100)),
            'attributesToRetrieve' => [
                'id',
                'title',
                'href',
                'workspace_slug',
                'journal_period',
                'path',
                'path_titles',
                'journal_path_nl',
                'journal_path_en',
                'headings',
                'headings_with_level',
                'heading_block_ids',
                'content_text',
                'type',
                'journal_granularity',
                'icon',
                'icon_color',
                'icon_bg',
            ],
            'showMatchesPosition' => true,
            'filter' => $this->buildNoteFilterExpression($workspaceIds, $includeJournal),
            'attributesToSearchOn' => array_values(array_filter([
                $includeNotes ? 'title' : null,
                $includeNotes ? 'path_titles' : null,
                $includeNotes ? 'journal_path_nl' : null,
                $includeNotes ? 'journal_path_en' : null,
                $includeHeadings ? 'headings' : null,
                $includeNotes ? 'content_text' : null,
            ])),
        ];

        /** @var SearchResult|array{hits?: array<int, array{id:mixed}>} $response */
        $response = $client->index($indexName)->search($query, $options);
        $hits = $response instanceof SearchResult
            ? $response->getHits()
            : ($response['hits'] ?? []);

        return collect($hits)
            ->map(function (array $hit) use ($query, $userLocale): ?array {
                $id = (string) ($hit['id'] ?? '');
                if ($id === '') {
                    return null;
                }

                $matchSource = $this->matchSourceFromHit($hit);
                $matchText = $this->matchTextFromHit($hit, $matchSource, $query);
                $matchBlockId = $this->matchBlockIdFromHit($hit, $matchSource);
                $path = $this->notePathFromHit($hit, $userLocale);
                $href = is_string($hit['href'] ?? null) && trim($hit['href']) !== ''
                    ? (string) $hit['href']
                    : $this->fallbackHrefFromHit($hit);

                $matchHeading = $matchSource === 'content'
                    ? $this->nearestHeadingForContentMatch($hit)
                    : null;

                return [
                    'id' => $id,
                    'title' => is_string($hit['title'] ?? null) ? (string) $hit['title'] : 'Untitled',
                    'href' => $href,
                    'slug' => null,
                    'path' => $path,
                    'type' => is_string($hit['type'] ?? null) ? (string) $hit['type'] : null,
                    'journal_granularity' => is_string($hit['journal_granularity'] ?? null) ? (string) $hit['journal_granularity'] : null,
                    'icon' => is_string($hit['icon'] ?? null) ? (string) $hit['icon'] : null,
                    'icon_color' => is_string($hit['icon_color'] ?? null) ? (string) $hit['icon_color'] : null,
                    'icon_bg' => is_string($hit['icon_bg'] ?? null) ? (string) $hit['icon_bg'] : null,
                    'match_source' => $matchSource,
                    'match_text' => $matchText,
                    'match_block_id' => $matchBlockId,
                    'match_heading' => $matchHeading,
                ];
            })
            ->filter(fn (?array $value) => is_array($value))
            ->values()
            ->all();
    }

    private function matchSourceFromHit(array $hit): ?string
    {
        $positions = $hit['_matchesPosition'] ?? null;
        if (! is_array($positions)) {
            return null;
        }

        if (isset($positions['title'])) {
            return 'title';
        }
        if (isset($positions['journal_path_nl']) || isset($positions['journal_path_en'])) {
            return 'path';
        }
        if (isset($positions['path_titles'])) {
            return 'path';
        }
        if (isset($positions['headings'])) {
            return 'heading';
        }
        if (isset($positions['content_text'])) {
            return 'content';
        }

        return null;
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array<string, mixed>>
     */
    private function searchTasksViaMeilisearch(
        string $query,
        array $workspaceIds,
        array $taskStatuses,
        bool $includeJournal,
        int $limit,
        string $userLocale,
    ): array {
        $host = (string) config('scout.meilisearch.host', '');
        if ($host === '') {
            return [];
        }

        $client = new Client($host, config('scout.meilisearch.key'));
        $indexName = (string) config('scout.prefix', '').(new NoteTask)->searchableAs();
        $options = [
            'limit' => max(1, min($limit, 100)),
            'attributesToRetrieve' => [
                'id',
                'note_id',
                'block_id',
                'section_heading',
                'content_text',
                'task_status',
                'checked',
                'href',
                'note_href',
                'note_display_title',
                'note_path',
                'note_journal_path_nl',
                'note_journal_path_en',
                'note_type',
                'note_journal_granularity',
                'note_icon',
                'note_icon_color',
                'note_icon_bg',
            ],
            'attributesToSearchOn' => ['content_text'],
            'filter' => $this->taskFilterExpression(
                workspaceIds: $workspaceIds,
                taskStatuses: $taskStatuses,
            ),
        ];

        /** @var SearchResult|array{hits?: array<int, array{id:mixed}>} $response */
        $response = $client->index($indexName)->search($query, $options);
        $hits = $response instanceof SearchResult
            ? $response->getHits()
            : ($response['hits'] ?? []);

        return collect($hits)
            ->map(fn (array $hit): ?array => $this->taskItemFromSearchHit($hit, $includeJournal, $userLocale))
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return \Illuminate\Support\Collection<int, NoteTask>
     */
    private function searchTasksViaDatabase(
        string $query,
        array $workspaceIds,
        array $taskStatuses,
        bool $includeJournal,
        int $limit,
    ): \Illuminate\Support\Collection {
        return NoteTask::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->where(function (Builder $builder) use ($query): void {
                $builder->where('content_text', 'like', "%{$query}%");
            })
            ->where(function (Builder $builder) use ($taskStatuses): void {
                $this->applyTaskStatusConstraint($builder, $taskStatuses);
            })
            ->when(! $includeJournal, fn (Builder $builder) => $builder->whereHas('note', function (Builder $noteQuery): void {
                $noteQuery->where(function (Builder $inner): void {
                    $inner->whereNull('type')
                        ->orWhere('type', '!=', Note::TYPE_JOURNAL);
                });
            }))
            ->limit($limit)
            ->get([
                'id',
                'workspace_id',
                'note_id',
                'block_id',
                'content_text',
                'checked',
                'task_status',
            ]);
    }

    private function matchTextFromHit(array $hit, ?string $matchSource, string $query): ?string
    {
        if ($matchSource === 'title') {
            return is_string($hit['title'] ?? null) ? $hit['title'] : null;
        }

        if ($matchSource === 'path') {
            $matchedPathField = $this->matchedPathFieldFromHit($hit);
            if ($matchedPathField === 'journal_path_nl' && is_string($hit['journal_path_nl'] ?? null)) {
                return $hit['journal_path_nl'];
            }
            if ($matchedPathField === 'journal_path_en' && is_string($hit['journal_path_en'] ?? null)) {
                return $hit['journal_path_en'];
            }
            if (is_string($hit['journal_path_nl'] ?? null)) {
                return $hit['journal_path_nl'];
            }
            if (is_string($hit['journal_path_en'] ?? null)) {
                return $hit['journal_path_en'];
            }

            return is_string($hit['path_titles'] ?? null) ? $hit['path_titles'] : null;
        }

        if ($matchSource === 'heading') {
            $matchIndex = null;
            $positions = $hit['_matchesPosition']['headings'] ?? null;
            if (is_array($positions) && is_array($positions[0]['indices'] ?? null)) {
                $matchIndex = (int) ($positions[0]['indices'][0] ?? 0);
            }

            $headings = $hit['headings'] ?? null;
            if (! is_array($headings) || $headings === []) {
                return null;
            }
            $candidate = $headings[$matchIndex] ?? $headings[0] ?? null;

            return is_string($candidate) ? $candidate : null;
        }

        if ($matchSource === 'content') {
            return $this->contentSnippetFromHit($hit, $query);
        }

        return null;
    }

    private function matchBlockIdFromHit(array $hit, ?string $matchSource): ?string
    {
        if ($matchSource !== 'heading') {
            return null;
        }

        $matchIndex = null;
        $positions = $hit['_matchesPosition']['headings'] ?? null;
        if (is_array($positions) && is_array($positions[0]['indices'] ?? null)) {
            $matchIndex = (int) ($positions[0]['indices'][0] ?? 0);
        }

        $headingBlockIds = $hit['heading_block_ids'] ?? null;
        if (! is_array($headingBlockIds) || $headingBlockIds === []) {
            return null;
        }

        $candidate = $headingBlockIds[$matchIndex] ?? $headingBlockIds[0] ?? null;
        if (! is_string($candidate)) {
            return null;
        }

        $trimmed = trim($candidate);

        return $trimmed !== '' ? $trimmed : null;
    }

    private function contentSnippetFromHit(array $hit, string $query): ?string
    {
        $content = $hit['content_text'] ?? null;
        if (! is_string($content) || trim($content) === '') {
            return null;
        }

        $lines = array_values(array_filter(
            explode("\n", $content),
            fn (string $line) => trim($line) !== '',
        ));

        if ($lines === []) {
            return null;
        }

        $start = $this->contentMatchStartFromHit($hit);
        $trimmedQuery = trim($query);

        // Find which line index contains the match position
        $matchLineIndex = null;
        if ($start !== null) {
            $offset = 0;
            foreach ($lines as $i => $line) {
                $lineLength = mb_strlen($line) + 1; // +1 for the newline
                if ($start < $offset + $lineLength) {
                    $matchLineIndex = $i;
                    break;
                }
                $offset += $lineLength;
            }
        }

        // Fall back to first line containing the query string
        if ($matchLineIndex === null && $trimmedQuery !== '') {
            foreach ($lines as $i => $line) {
                if (mb_stripos($line, $trimmedQuery) !== false) {
                    $matchLineIndex = $i;
                    break;
                }
            }
        }

        // Fall back to first 3 lines
        if ($matchLineIndex === null) {
            return implode("\n", array_slice($lines, 0, 3));
        }

        // Return the matched line plus one line of context above and below
        $from = max(0, $matchLineIndex - 1);
        $slice = array_slice($lines, $from, 3);

        return implode("\n", $slice);
    }

    private function contentMatchStartFromHit(array $hit): ?int
    {
        $positions = $hit['_matchesPosition']['content_text'] ?? null;
        if (! is_array($positions) || $positions === []) {
            return null;
        }

        $first = $positions[0] ?? null;
        if (! is_array($first)) {
            return null;
        }

        if (isset($first['start']) && is_numeric($first['start'])) {
            return (int) $first['start'];
        }

        return null;
    }

    private function nearestHeadingForContentMatch(array $hit): ?string
    {
        $headings = $hit['headings'] ?? null;
        if (! is_array($headings) || $headings === []) {
            return null;
        }

        $first = is_string($headings[0] ?? null) ? $headings[0] : null;

        if (count($headings) === 1) {
            return $first;
        }

        $content = is_string($hit['content_text'] ?? null) ? $hit['content_text'] : '';
        $contentLength = mb_strlen($content);
        $start = $this->contentMatchStartFromHit($hit);

        if ($start === null || $contentLength === 0) {
            return $first;
        }

        // Map the match position proportionally to a heading index
        $ratio = $start / $contentLength;
        $index = (int) floor($ratio * count($headings));
        $index = max(0, min(count($headings) - 1, $index));
        $candidate = $headings[$index] ?? null;

        return is_string($candidate) ? $candidate : $first;
    }

    private function matchedPathFieldFromHit(array $hit): ?string
    {
        $positions = $hit['_matchesPosition'] ?? null;
        if (! is_array($positions)) {
            return null;
        }

        if (isset($positions['journal_path_nl'])) {
            return 'journal_path_nl';
        }
        if (isset($positions['journal_path_en'])) {
            return 'journal_path_en';
        }
        if (isset($positions['path_titles'])) {
            return 'path_titles';
        }

        return null;
    }

    private function notePathFromHit(array $hit, string $userLocale): string
    {
        if ($userLocale === 'nl' && is_string($hit['journal_path_nl'] ?? null) && trim($hit['journal_path_nl']) !== '') {
            return (string) $hit['journal_path_nl'];
        }

        if ($userLocale === 'en' && is_string($hit['journal_path_en'] ?? null) && trim($hit['journal_path_en']) !== '') {
            return (string) $hit['journal_path_en'];
        }

        if (is_string($hit['path'] ?? null) && trim($hit['path']) !== '') {
            return (string) $hit['path'];
        }

        if (is_string($hit['journal_path_nl'] ?? null) && trim($hit['journal_path_nl']) !== '') {
            return (string) $hit['journal_path_nl'];
        }

        if (is_string($hit['journal_path_en'] ?? null) && trim($hit['journal_path_en']) !== '') {
            return (string) $hit['journal_path_en'];
        }

        if (is_string($hit['path_titles'] ?? null) && trim($hit['path_titles']) !== '') {
            return (string) $hit['path_titles'];
        }

        return is_string($hit['title'] ?? null) ? (string) $hit['title'] : 'Untitled';
    }

    private function fallbackHrefFromHit(array $hit): string
    {
        $workspaceSlug = is_string($hit['workspace_slug'] ?? null) && trim($hit['workspace_slug']) !== ''
            ? trim((string) $hit['workspace_slug'])
            : 'workspace';
        $id = is_string($hit['id'] ?? null) ? (string) $hit['id'] : '';
        if ($id === '') {
            return "/w/{$workspaceSlug}/notes";
        }

        if (
            ($hit['type'] ?? null) === Note::TYPE_JOURNAL
            && is_string($hit['journal_period'] ?? null)
            && trim((string) $hit['journal_period']) !== ''
        ) {
            return "/w/{$workspaceSlug}/journal/{$hit['journal_period']}";
        }

        return "/w/{$workspaceSlug}/notes/{$id}";
    }

    private function taskItemFromSearchHit(array $hit, bool $includeJournal, string $userLocale): ?array
    {
        $noteType = is_string($hit['note_type'] ?? null) ? (string) $hit['note_type'] : null;
        if (! $includeJournal && $noteType === Note::TYPE_JOURNAL) {
            return null;
        }

        $taskId = (string) ($hit['id'] ?? '');
        $noteId = (string) ($hit['note_id'] ?? '');
        if ($taskId === '' || $noteId === '') {
            return null;
        }

        $noteHref = is_string($hit['note_href'] ?? null) ? (string) $hit['note_href'] : null;
        $taskHref = is_string($hit['href'] ?? null) && trim($hit['href']) !== ''
            ? (string) $hit['href']
            : (is_string($noteHref) && trim($noteHref) !== '' && is_string($hit['block_id'] ?? null) && trim((string) $hit['block_id']) !== ''
                ? "{$noteHref}#{$hit['block_id']}"
                : $noteHref);

        $path = $userLocale === 'nl'
            ? (is_string($hit['note_journal_path_nl'] ?? null) && trim($hit['note_journal_path_nl']) !== '' ? (string) $hit['note_journal_path_nl'] : null)
            : (is_string($hit['note_journal_path_en'] ?? null) && trim($hit['note_journal_path_en']) !== '' ? (string) $hit['note_journal_path_en'] : null);
        if ($path === null) {
            $path = is_string($hit['note_path'] ?? null) ? (string) $hit['note_path'] : null;
        }

        return [
            'id' => $taskId,
            'note_id' => $noteId,
            'section_heading' => is_string($hit['section_heading'] ?? null) && trim((string) $hit['section_heading']) !== '' ? trim((string) $hit['section_heading']) : null,
            'title' => (string) ($hit['content_text'] ?? ''),
            'task_title' => (string) ($hit['content_text'] ?? ''),
            'note_title' => is_string($hit['note_display_title'] ?? null) ? (string) $hit['note_display_title'] : 'Untitled',
            'note_href' => $noteHref,
            'href' => $taskHref ?? '',
            'path' => $path,
            'type' => $noteType,
            'journal_granularity' => is_string($hit['note_journal_granularity'] ?? null) ? (string) $hit['note_journal_granularity'] : null,
            'icon' => is_string($hit['note_icon'] ?? null) ? (string) $hit['note_icon'] : null,
            'icon_color' => is_string($hit['note_icon_color'] ?? null) ? (string) $hit['note_icon_color'] : null,
            'icon_bg' => is_string($hit['note_icon_bg'] ?? null) ? (string) $hit['note_icon_bg'] : null,
            'task_status' => is_string($hit['task_status'] ?? null) ? (string) $hit['task_status'] : null,
            'checked' => (bool) ($hit['checked'] ?? false),
        ];
    }

    private function notePathForCommandResult(Note $note, string $locale): string
    {
        return $note->journalSearchPath($locale) ?? $note->path;
    }

    private function userLocaleForSearch(): string
    {
        $language = request()->user()?->languagePreference() ?? (string) config('app.locale', 'en');

        return in_array($language, ['nl', 'en'], true)
            ? $language
            : (string) config('app.locale', 'en');
    }

    /**
     * @param  array<int, string>  $workspaceIds
     */
    private function buildNoteFilterExpression(array $workspaceIds, bool $includeJournal): string
    {
        $clauses = [
            $this->inExpression('workspace_id', $workspaceIds),
        ];

        if (! $includeJournal) {
            $clauses[] = '(type != '.$this->quoted(Note::TYPE_JOURNAL).' OR type IS NULL)';
        }

        return implode(' AND ', $clauses);
    }

    /**
     * @param  array<int, string>  $workspaceIds
     */
    private function taskFilterExpression(array $workspaceIds, array $taskStatuses): string
    {
        $clauses = [
            $this->inExpression('workspace_id', $workspaceIds),
        ];

        $mappedStatuses = $this->mapTaskStatusesToSearchStatuses($taskStatuses);
        if ($mappedStatuses !== []) {
            $clauses[] = $this->inExpression('search_status', $mappedStatuses);
        }

        return implode(' AND ', $clauses);
    }

    /**
     * @param  array<int, string>  $taskStatuses
     * @return array<int, string>
     */
    private function mapTaskStatusesToSearchStatuses(array $taskStatuses): array
    {
        return collect($taskStatuses)
            ->map(function (string $status): ?string {
                return match ($status) {
                    'open' => 'open',
                    'in_progress' => 'in_progress',
                    'assigned' => 'assigned',
                    'starred' => 'starred',
                    'deferred' => 'backlog',
                    'migrated' => 'migrated',
                    'closed' => 'completed',
                    'canceled' => 'canceled',
                    default => null,
                };
            })
            ->filter(fn ($status) => is_string($status) && $status !== '')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $taskStatuses
     */
    private function applyTaskStatusConstraint(Builder $builder, array $taskStatuses): void
    {
        $normalized = collect($taskStatuses)
            ->map(fn (string $status) => strtolower(trim($status)))
            ->unique()
            ->values()
            ->all();

        $builder->where(function (Builder $outer) use ($normalized): void {
            foreach ($normalized as $status) {
                $outer->orWhere(function (Builder $clause) use ($status): void {
                    if ($status === 'open') {
                        $clause->where('checked', false)
                            ->where(function (Builder $inner): void {
                                $inner->whereNull('task_status')
                                    ->orWhereRaw('lower(task_status) not in (?, ?, ?, ?, ?, ?, ?)', [
                                        'canceled', 'migrated', 'assigned', 'in_progress', 'starred', 'backlog', 'question',
                                    ]);
                            });

                        return;
                    }

                    if ($status === 'in_progress') {
                        $clause->where('checked', false)->whereRaw('lower(task_status) = ?', ['in_progress']);

                        return;
                    }

                    if ($status === 'assigned') {
                        $clause->where('checked', false)->whereRaw('lower(task_status) = ?', ['assigned']);

                        return;
                    }

                    if ($status === 'starred') {
                        $clause->where('checked', false)->whereRaw('lower(task_status) = ?', ['starred']);

                        return;
                    }

                    if ($status === 'deferred') {
                        $clause->where('checked', false)->whereRaw('lower(task_status) in (?, ?)', ['backlog', 'question']);

                        return;
                    }

                    if ($status === 'migrated') {
                        $clause->where('checked', false)->whereRaw('lower(task_status) = ?', ['migrated']);

                        return;
                    }

                    if ($status === 'closed') {
                        $clause->where('checked', true);

                        return;
                    }

                    if ($status === 'canceled') {
                        $clause->where('checked', false)->whereRaw('lower(task_status) = ?', ['canceled']);
                    }
                });
            }
        });
    }

    private function inExpression(string $field, array $values): string
    {
        if (count($values) === 1) {
            return "{$field} = ".$this->quoted((string) $values[0]);
        }

        return "{$field} IN [".implode(', ', array_map(
            fn ($value) => $this->quoted((string) $value),
            $values,
        )).']';
    }

    private function quoted(string $value): string
    {
        return '"'.str_replace(['\\', '"'], ['\\\\', '\\"'], $value).'"';
    }

    private function usesMeilisearchDriver(): bool
    {
        return config('scout.driver') === 'meilisearch'
            && class_exists(Client::class);
    }

    /**
     * @return array{
     *   icons: array<string, string>,
     *   colors: array<string, string>
     * }
     */
    private function journalIconSettingsForUser(): array
    {
        $settings = request()->user()?->settings;
        $icons = is_array(data_get($settings, 'editor.journal_icons'))
            ? data_get($settings, 'editor.journal_icons')
            : [];
        $colors = is_array(data_get($settings, 'editor.journal_icon_colors'))
            ? data_get($settings, 'editor.journal_icon_colors')
            : [];

        return [
            'icons' => $icons,
            'colors' => $colors,
        ];
    }

    /**
     * @param  array{
     *   icons: array<string, string>,
     *   colors: array<string, string>
     * }  $journalIconSettings
     * @return array{0: string|null, 1: string|null}
     */
    private function resolveNoteIconPayload(Note $note, array $journalIconSettings): array
    {
        if ($note->type === Note::TYPE_JOURNAL) {
            $granularity = is_string($note->journal_granularity) ? $note->journal_granularity : Note::JOURNAL_DAILY;
            $icon = $journalIconSettings['icons'][$granularity] ?? $note->icon;
            $iconColor = $journalIconSettings['colors'][$granularity] ?? $note->icon_color;

            return [
                is_string($icon) ? $icon : $note->icon,
                is_string($iconColor) ? $iconColor : $note->icon_color,
            ];
        }

        return [$note->icon, $note->icon_color];
    }
}
