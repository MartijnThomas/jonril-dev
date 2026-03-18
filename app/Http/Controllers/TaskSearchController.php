<?php

namespace App\Http\Controllers;

use App\Models\NoteTask;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Validation\Rule;
use Meilisearch\Client;

class TaskSearchController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $workspaceIds = $user->workspaces()->pluck('workspaces.id')->values()->all();
        if ($workspaceIds === []) {
            abort(403, 'No workspace available.');
        }

        $data = $request->validate([
            'q' => ['nullable', 'string', 'max:160'],
            'workspace_ids' => ['nullable', 'array'],
            'workspace_ids.*' => [Rule::in($workspaceIds)],
            'note_scope_ids' => ['nullable', 'array'],
            'note_scope_ids.*' => ['string'],
            'status' => ['nullable', 'array'],
            'status.*' => ['string'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:10000'],
        ]);

        $searchQuery = trim((string) ($data['q'] ?? ''));
        $selectedWorkspaceIds = collect($data['workspace_ids'] ?? [])
            ->filter(fn ($id) => is_string($id) && trim($id) !== '')
            ->map(fn (string $id) => trim($id))
            ->unique()
            ->values()
            ->all();

        $effectiveWorkspaceIds = $selectedWorkspaceIds !== [] ? $selectedWorkspaceIds : $workspaceIds;
        $limit = (int) ($data['limit'] ?? 10000);

        return response()->json([
            'task_ids' => $this->matchingTaskIdsForWorkspaces(
                $searchQuery,
                $effectiveWorkspaceIds,
                $limit,
                [
                    'note_scope_ids' => $data['note_scope_ids'] ?? [],
                    'status' => $data['status'] ?? [],
                    'date_from' => $data['date_from'] ?? null,
                    'date_to' => $data['date_to'] ?? null,
                ],
            ),
        ]);
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @param  array{
     *     note_scope_ids?: array<int, string>,
     *     status?: array<int, string>,
     *     date_from?: string|null,
     *     date_to?: string|null
     * }  $filters
     * @return array<int, int>
     */
    public function matchingTaskIdsForWorkspaces(
        string $searchQuery,
        array $workspaceIds,
        int $limit = 10000,
        array $filters = [],
    ): array {
        $searchQuery = trim($searchQuery);
        if ($searchQuery === '' || $workspaceIds === []) {
            return [];
        }

        if ($this->usesMeilisearchDriver()) {
            return $this->matchingTaskIdsViaMeilisearch(
                $searchQuery,
                $workspaceIds,
                $limit,
                $filters,
            );
        }

        $safeLimit = max(1, min($limit, 10000));
        $perPage = min(250, $safeLimit);
        $page = 1;
        $taskIds = [];

        do {
            /** @var LengthAwarePaginator<int, NoteTask> $results */
            $results = NoteTask::search($searchQuery)
                ->query(fn (Builder $builder) => $builder->whereIn('workspace_id', $workspaceIds))
                ->paginate($perPage, 'page', $page);

            foreach ($results->items() as $task) {
                $taskId = (int) $task->id;
                if ($taskId > 0) {
                    $taskIds[$taskId] = $taskId;
                }

                if (count($taskIds) >= $safeLimit) {
                    break;
                }
            }

            if (count($taskIds) >= $safeLimit || $page >= $results->lastPage()) {
                break;
            }

            $page++;
        } while (true);

        return array_values($taskIds);
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @param  array{
     *     note_scope_ids?: array<int, string>,
     *     status?: array<int, string>,
     *     date_from?: string|null,
     *     date_to?: string|null
     * }  $filters
     * @return array<int, int>
     */
    private function matchingTaskIdsViaMeilisearch(
        string $searchQuery,
        array $workspaceIds,
        int $limit,
        array $filters,
    ): array {
        $host = (string) config('scout.meilisearch.host', '');
        if ($host === '') {
            return [];
        }

        $client = new Client($host, config('scout.meilisearch.key'));
        $indexName = (string) config('scout.prefix', '').(new NoteTask)->searchableAs();
        $filterExpression = $this->buildMeilisearchFilterExpression($workspaceIds, $filters);
        $safeLimit = max(1, min($limit, 10000));
        $chunk = min(250, $safeLimit);
        $offset = 0;
        $taskIds = [];

        while (count($taskIds) < $safeLimit) {
            $options = [
                'limit' => $chunk,
                'offset' => $offset,
                'attributesToRetrieve' => ['id'],
            ];
            if ($filterExpression !== null) {
                $options['filter'] = $filterExpression;
            }

            /** @var array{hits?: array<int, array{id:mixed}>, estimatedTotalHits?: int} $response */
            $response = $client->index($indexName)->search($searchQuery, $options);
            $hits = $response['hits'] ?? [];
            if ($hits === []) {
                break;
            }

            foreach ($hits as $hit) {
                $taskId = (int) ($hit['id'] ?? 0);
                if ($taskId > 0) {
                    $taskIds[$taskId] = $taskId;
                }

                if (count($taskIds) >= $safeLimit) {
                    break;
                }
            }

            $offset += count($hits);
            $estimatedTotalHits = (int) ($response['estimatedTotalHits'] ?? 0);
            if ($offset >= $estimatedTotalHits || count($hits) < $chunk) {
                break;
            }
        }

        return array_values($taskIds);
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @param  array{
     *     note_scope_ids?: array<int, string>,
     *     status?: array<int, string>,
     *     date_from?: string|null,
     *     date_to?: string|null
     * }  $filters
     */
    private function buildMeilisearchFilterExpression(array $workspaceIds, array $filters): ?string
    {
        $clauses = [];
        $clauses[] = $this->inExpression('workspace_id', $workspaceIds);

        $noteScopeIds = collect($filters['note_scope_ids'] ?? [])
            ->filter(fn ($id) => is_string($id) && trim($id) !== '')
            ->map(fn (string $id) => trim($id))
            ->unique()
            ->values()
            ->all();
        if ($noteScopeIds !== []) {
            $noteIdExpression = $this->inExpression('note_id', $noteScopeIds);
            $parentNoteIdExpression = $this->inExpression('parent_note_id', $noteScopeIds);
            $clauses[] = "({$noteIdExpression} OR {$parentNoteIdExpression})";
        }

        $statuses = collect($filters['status'] ?? [])
            ->filter(fn ($status) => is_string($status) && trim($status) !== '')
            ->map(fn (string $status) => trim(strtolower($status)))
            ->unique()
            ->values()
            ->all();
        if ($statuses !== []) {
            $mappedStatuses = collect($statuses)
                ->map(fn (string $status) => $status === 'question' ? 'backlog' : $status)
                ->unique()
                ->values()
                ->all();
            $clauses[] = $this->inExpression('search_status', $mappedStatuses);
        }

        $dateFrom = is_string($filters['date_from'] ?? null) ? trim((string) $filters['date_from']) : '';
        $dateTo = is_string($filters['date_to'] ?? null) ? trim((string) $filters['date_to']) : '';
        if ($dateFrom !== '' || $dateTo !== '') {
            $dueDateExpression = $this->dateRangeExpression('due_date', $dateFrom, $dateTo);
            $deadlineDateExpression = $this->dateRangeExpression('deadline_date', $dateFrom, $dateTo);
            $journalDateExpression = $this->dateRangeExpression('journal_date', $dateFrom, $dateTo);

            $clauses[] = '('.implode(' OR ', [
                $dueDateExpression,
                $deadlineDateExpression,
                '(due_date IS NULL AND deadline_date IS NULL AND journal_date IS NOT NULL AND '.$journalDateExpression.')',
            ]).')';
        }

        $clauses = array_values(array_filter($clauses, fn ($value) => $value !== null && $value !== ''));

        return $clauses === [] ? null : implode(' AND ', $clauses);
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

    private function dateRangeExpression(string $field, string $dateFrom, string $dateTo): string
    {
        $parts = [];
        if ($dateFrom !== '') {
            $parts[] = "{$field} >= ".$this->quoted($dateFrom);
        }
        if ($dateTo !== '') {
            $parts[] = "{$field} <= ".$this->quoted($dateTo);
        }

        return $parts === [] ? 'true' : implode(' AND ', $parts);
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
}
