<?php

namespace App\Http\Controllers;

use App\Models\NoteTask;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Validation\Rule;

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
            'task_ids' => $this->matchingTaskIdsForWorkspaces($searchQuery, $effectiveWorkspaceIds, $limit),
        ]);
    }

    /**
     * @param  array<int, string>  $workspaceIds
     * @return array<int, int>
     */
    public function matchingTaskIdsForWorkspaces(
        string $searchQuery,
        array $workspaceIds,
        int $limit = 10000,
    ): array {
        $searchQuery = trim($searchQuery);
        if ($searchQuery === '' || $workspaceIds === []) {
            return [];
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
}
