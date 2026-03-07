<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteTask;
use App\Support\Notes\NoteSlugService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class TasksController extends Controller
{
    public function __construct(
        private readonly NoteSlugService $noteSlugService,
    ) {}

    public function index(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            abort(403, 'No workspace available.');
        }

        $workspaces = $user->workspaces()
            ->select('workspaces.id', 'workspaces.name')
            ->orderByRaw("case when workspace_user.role = 'owner' then 0 else 1 end")
            ->orderBy('workspaces.name')
            ->get();

        $workspaceIds = $workspaces->pluck('id')->values()->all();
        if ($workspaceIds === []) {
            abort(403, 'No workspace available.');
        }

        /** @var array<string, string> $workspaceNamesById */
        $workspaceNamesById = $workspaces
            ->pluck('name', 'id')
            ->all();

        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'workspace_id' => ['nullable', Rule::in($workspaceIds)],
            'note_scope_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'mention' => ['nullable', 'string', 'max:120'],
            'hashtag' => ['nullable', 'string', 'max:120'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'show_completed' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in(['updated', 'due', 'deadline', 'note', 'position'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $query = NoteTask::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->with('note:id,title,slug,type,journal_granularity,journal_date');

        if ($filters['workspace_id'] ?? null) {
            $query->where('workspace_id', $filters['workspace_id']);
        }

        if (! ($filters['show_completed'] ?? false)) {
            $query->where('checked', false);
        }

        if (($filters['q'] ?? null) !== null && trim($filters['q']) !== '') {
            $needle = trim((string) $filters['q']);
            $query->where(function ($inner) use ($needle) {
                $inner->where('content_text', 'like', "%{$needle}%")
                    ->orWhere('note_title', 'like', "%{$needle}%")
                    ->orWhere('parent_note_title', 'like', "%{$needle}%");
            });
        }

        if ($filters['note_scope_id'] ?? null) {
            $scopeNoteId = $filters['note_scope_id'];
            $query->where(function ($inner) use ($scopeNoteId) {
                $inner->where('note_id', $scopeNoteId)
                    ->orWhere('parent_note_id', $scopeNoteId);
            });
        }

        if ($filters['mention'] ?? null) {
            $mention = strtolower(trim((string) $filters['mention']));
            $query->whereRaw('LOWER(mentions) LIKE ?', ["%\"{$mention}\"%"]);
        }

        if ($filters['hashtag'] ?? null) {
            $hashtag = strtolower(trim((string) $filters['hashtag']));
            $query->whereRaw('LOWER(hashtags) LIKE ?', ["%\"{$hashtag}\"%"]);
        }

        if (($filters['date_from'] ?? null) || ($filters['date_to'] ?? null)) {
            $dateFrom = $filters['date_from'] ?? $filters['date_to'] ?? null;
            $dateTo = $filters['date_to'] ?? $filters['date_from'] ?? null;

            $query->where(function ($inner) use ($dateFrom, $dateTo) {
                $inner->where(function ($sub) use ($dateFrom, $dateTo) {
                    if ($dateFrom) {
                        $sub->whereDate('due_date', '>=', $dateFrom);
                    }
                    if ($dateTo) {
                        $sub->whereDate('due_date', '<=', $dateTo);
                    }
                })->orWhere(function ($sub) use ($dateFrom, $dateTo) {
                    if ($dateFrom) {
                        $sub->whereDate('deadline_date', '>=', $dateFrom);
                    }
                    if ($dateTo) {
                        $sub->whereDate('deadline_date', '<=', $dateTo);
                    }
                });
            });
        }

        $sort = $filters['sort'] ?? 'due';
        $direction = $filters['direction'] ?? 'asc';

        $this->applySorting($query, $sort, $direction);

        $tasks = $query
            ->paginate(50)
            ->withQueryString()
            ->through(function (NoteTask $task) {
                $note = $task->note;

                return [
                    'id' => $task->id,
                    'block_id' => $task->block_id,
                    'position' => $task->position,
                    'checked' => $task->checked,
                    'content' => $task->content_text,
                    'due_date' => $task->due_date?->toDateString(),
                    'deadline_date' => $task->deadline_date?->toDateString(),
                    'mentions' => $task->mentions ?? [],
                    'hashtags' => $task->hashtags ?? [],
                    'note' => [
                        'id' => $task->note_id,
                        'title' => $task->note_title ?? 'Untitled',
                        'href' => $note ? $this->noteSlugService->urlFor($note) : "/notes/{$task->note_id}",
                        'workspace_id' => $task->workspace_id,
                        'workspace_name' => $workspaceNamesById[$task->workspace_id] ?? null,
                        'parent_id' => $task->parent_note_id,
                        'parent_title' => $task->parent_note_title,
                    ],
                    'updated_at' => $task->updated_at?->toIso8601String(),
                ];
            });

        $notes = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->where(function ($query) {
                $query->whereNull('type')->orWhere('type', '!=', Note::TYPE_JOURNAL);
            })
            ->when(
                $filters['workspace_id'] ?? null,
                fn ($query, string $workspaceId) => $query->where('workspace_id', $workspaceId)
            )
            ->orderBy('title')
            ->get(['id', 'title', 'workspace_id'])
            ->map(fn (Note $note) => [
                'id' => $note->id,
                'title' => $note->title ?? 'Untitled',
                'workspace_id' => $note->workspace_id,
                'workspace_name' => $workspaceNamesById[$note->workspace_id] ?? null,
            ])
            ->values();

        $noteTreeOptions = $this->buildNoteTreeOptions(
            $workspaceNamesById,
            $notes->toArray(),
            $filters['workspace_id'] ?? '',
            count($workspaceIds) > 1,
        );

        return Inertia::render('tasks/index', [
            'tasks' => $tasks,
            'filters' => [
                'q' => $filters['q'] ?? '',
                'workspace_id' => $filters['workspace_id'] ?? '',
                'note_scope_id' => $filters['note_scope_id'] ?? '',
                'mention' => $filters['mention'] ?? '',
                'hashtag' => $filters['hashtag'] ?? '',
                'date_from' => $filters['date_from'] ?? '',
                'date_to' => $filters['date_to'] ?? '',
                'show_completed' => (bool) ($filters['show_completed'] ?? false),
                'sort' => $sort,
                'direction' => $direction,
            ],
            'notes' => $notes,
            'noteTreeOptions' => $noteTreeOptions,
            'workspaces' => $workspaces
                ->map(fn ($workspace) => [
                    'id' => $workspace->id,
                    'name' => $workspace->name,
                ])
                ->values(),
        ]);
    }

    public function updateChecked(Request $request, NoteTask $task)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $workspaceIds = $user->workspaces()->pluck('workspaces.id')->all();
        if (! in_array($task->workspace_id, $workspaceIds, true)) {
            abort(403);
        }

        $data = $request->validate([
            'checked' => ['required', 'boolean'],
        ]);

        $note = Note::query()
            ->where('workspace_id', $task->workspace_id)
            ->find($task->note_id);
        if (! $note) {
            abort(404);
        }

        $content = is_array($note->content) ? $note->content : null;
        if (! $content) {
            abort(422, 'Note content is invalid.');
        }

        $updated = false;
        if (is_string($task->block_id) && $task->block_id !== '') {
            $updated = $this->updateTaskItemCheckedByBlockId(
                $content,
                $task->block_id,
                (bool) $data['checked'],
            );
        }

        if (! $updated) {
            $updated = $this->updateTaskItemCheckedByPosition(
                $content,
                (int) $task->position,
                (bool) $data['checked'],
            );
        }

        if (! $updated) {
            abort(422, 'Unable to locate task item in note content.');
        }

        $note->content = $content;
        $note->save();

        return back();
    }

    public function updateCheckedByReference(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $workspaceIds = $user->workspaces()->pluck('workspaces.id')->all();
        if ($workspaceIds === []) {
            abort(403);
        }

        $data = $request->validate([
            'note_id' => [
                'required',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'block_id' => ['nullable', 'string', 'max:255'],
            'position' => ['required_without:block_id', 'integer', 'min:1'],
            'checked' => ['required', 'boolean'],
        ]);

        $note = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->find($data['note_id']);
        if (! $note) {
            abort(404);
        }

        $content = is_array($note->content) ? $note->content : null;
        if (! $content) {
            abort(422, 'Note content is invalid.');
        }

        $updated = false;
        if (is_string($data['block_id'] ?? null) && trim((string) $data['block_id']) !== '') {
            $updated = $this->updateTaskItemCheckedByBlockId(
                $content,
                trim((string) $data['block_id']),
                (bool) $data['checked'],
            );
        }

        if (! $updated) {
            $position = (int) ($data['position'] ?? 0);
            if ($position > 0) {
                $updated = $this->updateTaskItemCheckedByPosition(
                    $content,
                    $position,
                    (bool) $data['checked'],
                );
            }
        }

        if (! $updated) {
            abort(422, 'Unable to locate task item in note content.');
        }

        $note->content = $content;
        $note->save();

        return back();
    }

    /**
     * @param  array<string, string>  $workspaceNamesById
     * @param  array<int, array{id: string, title: string, workspace_id: string, workspace_name: string|null}>  $notes
     * @return array<int, array{id: string, title: string}>
     */
    private function buildNoteTreeOptions(
        array $workspaceNamesById,
        array $notes,
        string $workspaceId,
        bool $showWorkspacePrefix,
    ): array {
        $items = Note::query()
            ->whereIn('id', array_column($notes, 'id'))
            ->orderBy('title')
            ->get(['id', 'parent_id', 'workspace_id']);

        $nodeById = [];
        foreach ($notes as $note) {
            $nodeById[$note['id']] = [
                'id' => $note['id'],
                'title' => $note['title'],
                'workspace_id' => $note['workspace_id'],
                'parent_id' => null,
            ];
        }

        foreach ($items as $item) {
            if (! isset($nodeById[$item->id])) {
                continue;
            }

            $nodeById[$item->id]['parent_id'] = $item->parent_id;
        }

        $resolvePath = function (string $noteId) use (&$resolvePath, &$nodeById): string {
            $node = $nodeById[$noteId] ?? null;
            if (! $node) {
                return '';
            }

            $title = (string) $node['title'];
            $parentId = $node['parent_id'];
            if (! is_string($parentId) || $parentId === '' || ! isset($nodeById[$parentId])) {
                return $title;
            }

            $parentPath = $resolvePath($parentId);

            return $parentPath !== '' ? "{$parentPath} / {$title}" : $title;
        };

        return collect($notes)
            ->filter(function (array $note) use ($workspaceId): bool {
                if ($workspaceId === '') {
                    return true;
                }

                return $note['workspace_id'] === $workspaceId;
            })
            ->map(function (array $note) use ($resolvePath, $showWorkspacePrefix, $workspaceNamesById) {
                $path = $resolvePath($note['id']);
                $workspaceName = $workspaceNamesById[$note['workspace_id']] ?? 'Workspace';

                return [
                    'id' => $note['id'],
                    'title' => $showWorkspacePrefix
                        ? "{$workspaceName} / {$path}"
                        : $path,
                ];
            })
            ->sortBy('title')
            ->values()
            ->all();
    }

    private function applySorting(Builder $query, string $sort, string $direction): void
    {
        match ($sort) {
            'deadline' => $query
                ->orderByRaw('deadline_date IS NULL')
                ->orderBy('deadline_date', $direction)
                ->orderBy('updated_at', 'desc'),
            'updated' => $query->orderBy('updated_at', $direction),
            'note' => $query->orderBy('note_title', $direction)->orderBy('position'),
            'position' => $query->orderBy('position', $direction)->orderBy('updated_at', 'desc'),
            default => $query
                ->orderByRaw('due_date IS NULL')
                ->orderBy('due_date', $direction)
                ->orderBy('updated_at', 'desc'),
        };
    }

    /**
     * @param  array<string, mixed>  $content
     */
    private function updateTaskItemCheckedByBlockId(array &$content, string $blockId, bool $checked): bool
    {
        if (! isset($content['content']) || ! is_array($content['content'])) {
            return false;
        }

        return $this->walkAndUpdateByBlockId($content['content'], $blockId, $checked);
    }

    /**
     * @param  array<int, mixed>  $nodes
     */
    private function walkAndUpdateByBlockId(array &$nodes, string $blockId, bool $checked): bool
    {
        foreach ($nodes as &$node) {
            if (! is_array($node)) {
                continue;
            }

            if (($node['type'] ?? null) === 'taskItem' && (($node['attrs']['id'] ?? null) === $blockId)) {
                $node['attrs'] = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
                $node['attrs']['checked'] = $checked;

                return true;
            }

            if (isset($node['content']) && is_array($node['content'])) {
                if ($this->walkAndUpdateByBlockId($node['content'], $blockId, $checked)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $content
     */
    private function updateTaskItemCheckedByPosition(array &$content, int $targetPosition, bool $checked): bool
    {
        if (! isset($content['content']) || ! is_array($content['content'])) {
            return false;
        }

        $position = 0;

        return $this->walkAndUpdateByPosition($content['content'], $targetPosition, $position, $checked);
    }

    /**
     * @param  array<int, mixed>  $nodes
     */
    private function walkAndUpdateByPosition(array &$nodes, int $targetPosition, int &$position, bool $checked): bool
    {
        foreach ($nodes as &$node) {
            if (! is_array($node)) {
                continue;
            }

            if (($node['type'] ?? null) === 'taskItem') {
                $position++;
                if ($position === $targetPosition) {
                    $node['attrs'] = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
                    $node['attrs']['checked'] = $checked;

                    return true;
                }
            }

            if (isset($node['content']) && is_array($node['content'])) {
                if ($this->walkAndUpdateByPosition($node['content'], $targetPosition, $position, $checked)) {
                    return true;
                }
            }
        }

        return false;
    }
}
