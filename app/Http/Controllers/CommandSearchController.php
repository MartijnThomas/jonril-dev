<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteHeading;
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
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $mode = $data['mode'] ?? 'notes';
        $query = trim((string) ($data['q'] ?? ''));
        $includeNotes = (bool) ($data['include_notes'] ?? true);
        $includeJournal = (bool) ($data['include_journal'] ?? false);
        $includeHeadings = (bool) ($data['include_headings'] ?? false);
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

        $matchMetaById = collect();
        if ($this->usesMeilisearchDriver()) {
            $matches = $this->matchingNotesViaMeilisearch(
                query: $query,
                workspaceIds: $workspaceIds,
                includeNotes: $includeNotes,
                includeJournal: $includeJournal,
                includeHeadings: $includeHeadings,
                limit: $limit,
            );
            $noteIds = collect($matches)
                ->pluck('id')
                ->values()
                ->all();
            if ($noteIds === []) {
                return [];
            }
            $matchMetaById = collect($matches)->keyBy('id');

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

            $notes = collect($noteIds)
                ->map(fn (string $noteId) => $notesById->get($noteId))
                ->filter()
                ->values();
        } else {
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
        }

        $journalIconSettings = $this->journalIconSettingsForUser();
        $userLocale = $this->userLocaleForSearch();

        return $notes
            ->map(function (Note $note) use ($journalIconSettings, $matchMetaById, $userLocale): array {
                $href = $this->noteSlugService->urlFor($note);
                [$icon, $iconColor] = $this->resolveNoteIconPayload($note, $journalIconSettings);
                $matchMeta = $matchMetaById->get((string) $note->id);

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
                    'match_source' => is_array($matchMeta) ? ($matchMeta['source'] ?? null) : null,
                    'match_text' => is_array($matchMeta) ? ($matchMeta['text'] ?? null) : null,
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
     * @return array<int, string>
     */
    private function matchingNotesViaMeilisearch(
        string $query,
        array $workspaceIds,
        bool $includeNotes,
        bool $includeJournal,
        bool $includeHeadings,
        int $limit,
    ): array {
        $host = (string) config('scout.meilisearch.host', '');
        if ($host === '') {
            return [];
        }

        $client = new Client($host, config('scout.meilisearch.key'));
        $indexName = (string) config('scout.prefix', '').(new Note)->searchableAs();
        $options = [
            'limit' => max(1, min($limit, 100)),
            'attributesToRetrieve' => ['id', 'title', 'path_titles', 'journal_path_nl', 'journal_path_en', 'headings', 'headings_with_level'],
            'showMatchesPosition' => true,
            'filter' => $this->buildNoteFilterExpression($workspaceIds, $includeJournal),
            'attributesToSearchOn' => array_values(array_filter([
                $includeNotes ? 'title' : null,
                $includeNotes ? 'path_titles' : null,
                $includeNotes ? 'journal_path_nl' : null,
                $includeNotes ? 'journal_path_en' : null,
                $includeHeadings ? 'headings' : null,
            ])),
        ];

        /** @var SearchResult|array{hits?: array<int, array{id:mixed}>} $response */
        $response = $client->index($indexName)->search($query, $options);
        $hits = $response instanceof SearchResult
            ? $response->getHits()
            : ($response['hits'] ?? []);

        return collect($hits)
            ->map(function (array $hit): ?array {
                $id = (string) ($hit['id'] ?? '');
                if ($id === '') {
                    return null;
                }

                $matchSource = $this->matchSourceFromHit($hit);
                $matchText = $this->matchTextFromHit($hit, $matchSource);

                return [
                    'id' => $id,
                    'source' => $matchSource,
                    'text' => $matchText,
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

        return null;
    }

    private function matchTextFromHit(array $hit, ?string $matchSource): ?string
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

            $headingsWithLevel = $hit['headings_with_level'] ?? null;
            if (is_array($headingsWithLevel) && isset($headingsWithLevel[$matchIndex]) && is_string($headingsWithLevel[$matchIndex])) {
                return $headingsWithLevel[$matchIndex];
            }

            $headings = $hit['headings'] ?? null;
            if (! is_array($headings) || $headings === []) {
                return null;
            }
            $fallback = $headings[$matchIndex] ?? $headings[0] ?? null;

            return is_string($fallback) ? "### {$fallback}" : null;
        }

        return null;
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
