<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteTask;
use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteSlugService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Illuminate\Support\Str;

class TasksController extends Controller
{
    public function __construct(
        private readonly NoteSlugService $noteSlugService,
        private readonly JournalNoteService $journalNoteService,
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
                    'task_status' => $task->task_status,
                    'priority' => $task->priority,
                    'content' => $task->content_text,
                    'render_fragments' => $task->render_fragments ?? [],
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

    public function migrateTargets(Request $request)
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
            'source_note_id' => [
                'required',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'q' => ['nullable', 'string', 'max:160'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:30'],
        ]);

        $sourceNote = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->findOrFail($data['source_note_id']);

        $workspaceId = (string) $sourceNote->workspace_id;
        $limit = (int) ($data['limit'] ?? 20);
        $query = trim((string) ($data['q'] ?? ''));
        $language = $user->language ?? 'nl';
        $today = CarbonImmutable::now();

        $presetTargets = [
            [Note::JOURNAL_DAILY, $today],
            [Note::JOURNAL_DAILY, $today->addDay()],
            [Note::JOURNAL_WEEKLY, $today],
            [Note::JOURNAL_WEEKLY, $today->addWeek()],
            [Note::JOURNAL_MONTHLY, $today],
            [Note::JOURNAL_MONTHLY, $today->addMonth()],
        ];

        $existingJournalNotes = Note::query()
            ->where('workspace_id', $workspaceId)
            ->where('type', Note::TYPE_JOURNAL)
            ->where(function ($builder) use ($presetTargets): void {
                foreach ($presetTargets as [$granularity, $date]) {
                    $builder->orWhere(function ($inner) use ($granularity, $date): void {
                        $inner->where('journal_granularity', $granularity)
                            ->whereDate('journal_date', $date->toDateString());
                    });
                }
            })
            ->get(['id', 'journal_granularity', 'journal_date', 'title', 'slug']);

        $journalByKey = $existingJournalNotes->keyBy(
            fn (Note $note) => "{$note->journal_granularity}:{$note->journal_date?->toDateString()}"
        );

        $items = [];
        foreach ($presetTargets as [$granularity, $date]) {
            $period = $this->journalNoteService->periodFor($granularity, $date);
            $title = $this->journalNoteService->titleFor($granularity, $date, $language);
            $key = "{$granularity}:{$date->toDateString()}";
            $existing = $journalByKey->get($key);

            $items[] = [
                'key' => "journal:{$granularity}:{$period}",
                'title' => $title,
                'path' => "/journal/{$granularity}/{$period}",
                'target_note_id' => $existing?->id,
                'target_journal_granularity' => $granularity,
                'target_journal_period' => $period,
            ];
        }

        $noteItems = Note::query()
            ->where('workspace_id', $workspaceId)
            ->where('id', '!=', $sourceNote->id)
            ->when($query !== '', function ($builder) use ($query): void {
                $builder->where(function ($inner) use ($query): void {
                    $inner->where('title', 'like', "%{$query}%")
                        ->orWhere('slug', 'like', "%{$query}%");
                });
            })
            ->orderByDesc('updated_at')
            ->limit($limit)
            ->get(['id', 'title', 'slug'])
            ->map(fn (Note $note) => [
                'key' => "note:{$note->id}",
                'title' => $note->display_title,
                'path' => $note->path,
                'target_note_id' => $note->id,
                'target_journal_granularity' => null,
                'target_journal_period' => null,
            ])
            ->values()
            ->all();

        $items = collect([...$items, ...$noteItems])
            ->filter(function (array $item) use ($query): bool {
                if ($query === '') {
                    return true;
                }

                $haystacks = [
                    mb_strtolower((string) ($item['title'] ?? '')),
                    mb_strtolower((string) ($item['path'] ?? '')),
                ];
                $needle = mb_strtolower($query);

                foreach ($haystacks as $haystack) {
                    if ($haystack !== '' && str_contains($haystack, $needle)) {
                        return true;
                    }
                }

                return false;
            })
            ->unique('key')
            ->take($limit)
            ->values()
            ->all();

        return response()->json([
            'items' => $items,
        ]);
    }

    public function migrate(Request $request)
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
            'source_note_id' => [
                'required',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'block_id' => ['nullable', 'string', 'max:255'],
            'position' => ['required_without:block_id', 'integer', 'min:1'],
            'target_note_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'target_journal_granularity' => [
                'nullable',
                Rule::in([
                    Note::JOURNAL_DAILY,
                    Note::JOURNAL_WEEKLY,
                    Note::JOURNAL_MONTHLY,
                    Note::JOURNAL_YEARLY,
                ]),
            ],
            'target_journal_period' => ['nullable', 'string', 'max:32'],
        ]);

        $sourceNote = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->findOrFail($data['source_note_id']);

        $targetNote = null;
        if (is_string($data['target_note_id'] ?? null) && $data['target_note_id'] !== '') {
            $targetNote = Note::query()
                ->where('workspace_id', $sourceNote->workspace_id)
                ->find($data['target_note_id']);
        } elseif (
            is_string($data['target_journal_granularity'] ?? null) &&
            is_string($data['target_journal_period'] ?? null)
        ) {
            $workspace = $sourceNote->workspace()->first();
            if (! $workspace) {
                abort(404);
            }

            $targetNote = $this->journalNoteService->resolveOrCreate(
                $workspace,
                $data['target_journal_granularity'],
                $data['target_journal_period'],
                $user->language,
            );
        }

        if (! $targetNote) {
            abort(422, 'A target note is required.');
        }

        if ((string) $targetNote->id === (string) $sourceNote->id) {
            abort(422, 'Source and target note cannot be the same.');
        }

        $sourceContent = is_array($sourceNote->content) ? $sourceNote->content : null;
        $targetContent = is_array($targetNote->content) ? $targetNote->content : null;
        if (! $sourceContent || ! $targetContent) {
            abort(422, 'Note content is invalid.');
        }

        $migrated = $this->migrateTaskBetweenNotes(
            sourceContent: $sourceContent,
            targetContent: $targetContent,
            sourceNote: $sourceNote,
            targetNote: $targetNote,
            blockId: is_string($data['block_id'] ?? null) ? trim((string) $data['block_id']) : null,
            position: (int) ($data['position'] ?? 0),
        );

        if (! $migrated) {
            abort(422, 'Unable to locate task item in note content.');
        }

        $sourceNote->content = $sourceContent;
        $sourceNote->save();

        $targetNote->content = $targetContent;
        $targetNote->save();

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
     * @param  array<string, mixed>  $sourceContent
     * @param  array<string, mixed>  $targetContent
     */
    private function migrateTaskBetweenNotes(
        array &$sourceContent,
        array &$targetContent,
        Note $sourceNote,
        Note $targetNote,
        ?string $blockId,
        int $position,
    ): bool {
        if (! isset($sourceContent['content']) || ! is_array($sourceContent['content'])) {
            return false;
        }

        $counter = 0;
        $clonedTask = null;
        $sourceTaskBlockId = null;

        $matched = $this->walkAndMigrateTask(
            $sourceContent['content'],
            $blockId,
            $position,
            $counter,
            $sourceNote,
            $targetNote,
            $clonedTask,
            $sourceTaskBlockId,
        );

        if (! $matched || ! is_array($clonedTask)) {
            return false;
        }

        if (! isset($targetContent['content']) || ! is_array($targetContent['content'])) {
            $targetContent['content'] = [];
        }

        $this->appendTaskToDocumentEnd($targetContent['content'], $clonedTask);

        return true;
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  array<string, mixed>|null  $clonedTask
     */
    private function walkAndMigrateTask(
        array &$nodes,
        ?string $blockId,
        int $targetPosition,
        int &$counter,
        Note $sourceNote,
        Note $targetNote,
        ?array &$clonedTask,
        ?string &$sourceTaskBlockId,
    ): bool {
        foreach ($nodes as &$node) {
            if (! is_array($node)) {
                continue;
            }

            if (($node['type'] ?? null) === 'taskItem') {
                $counter += 1;
                $nodeAttrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
                $nodeBlockId = is_string($nodeAttrs['id'] ?? null) ? (string) $nodeAttrs['id'] : null;
                $isMatch = ($blockId !== null && $blockId !== '' && $nodeBlockId === $blockId)
                    || (($blockId === null || $blockId === '') && $targetPosition > 0 && $counter === $targetPosition);

                if ($isMatch) {
                    $sourceTaskBlockId = $nodeBlockId && $nodeBlockId !== ''
                        ? $nodeBlockId
                        : (string) Str::uuid();

                    $baseTask = $node;
                    $baseAttrs = is_array($baseTask['attrs'] ?? null) ? $baseTask['attrs'] : [];
                    $baseContent = is_array($baseTask['content'] ?? null) ? $baseTask['content'] : [];
                    $baseContent = array_values(array_filter($baseContent, fn ($child) => ! $this->isMigrationMetaParagraph($child)));

                    $baseAttrs['id'] = $sourceTaskBlockId;

                    $node = $baseTask;
                    $node['attrs'] = array_merge($baseAttrs, [
                        'checked' => false,
                        'taskStatus' => 'migrated',
                        'migratedToNoteId' => (string) $targetNote->id,
                        'migratedFromNoteId' => null,
                        'migratedFromBlockId' => null,
                    ]);
                    $node['content'] = $baseContent;

                    $newTaskId = (string) Str::uuid();
                    $clonedTask = $baseTask;
                    $clonedTask['attrs'] = array_merge($baseAttrs, [
                        'id' => $newTaskId,
                        'checked' => false,
                        'taskStatus' => null,
                        'migratedToNoteId' => null,
                        'migratedFromNoteId' => (string) $sourceNote->id,
                        'migratedFromBlockId' => $sourceTaskBlockId,
                    ]);
                    $clonedTask['content'] = $baseContent;

                    return true;
                }
            }

            if (isset($node['content']) && is_array($node['content'])) {
                if ($this->walkAndMigrateTask(
                    $node['content'],
                    $blockId,
                    $targetPosition,
                    $counter,
                    $sourceNote,
                    $targetNote,
                    $clonedTask,
                    $sourceTaskBlockId,
                )) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param  array<int, mixed>  $docContent
     * @param  array<string, mixed>  $taskItem
     */
    private function appendTaskToDocumentEnd(array &$docContent, array $taskItem): void
    {
        $lastIndex = count($docContent) - 1;
        if (
            $lastIndex >= 0
            && is_array($docContent[$lastIndex] ?? null)
            && (($docContent[$lastIndex]['type'] ?? null) === 'taskList')
            && is_array($docContent[$lastIndex]['content'] ?? null)
        ) {
            $docContent[$lastIndex]['content'][] = $taskItem;

            return;
        }

        $docContent[] = [
            'type' => 'taskList',
            'content' => [$taskItem],
        ];
    }

    private function isMigrationMetaParagraph(mixed $node): bool
    {
        if (! is_array($node) || ($node['type'] ?? null) !== 'paragraph') {
            return false;
        }

        $content = $node['content'] ?? null;
        if (! is_array($content) || ! isset($content[0]) || ! is_array($content[0])) {
            return false;
        }

        $firstText = strtolower(trim((string) ($content[0]['text'] ?? '')));

        return str_starts_with($firstText, 'migrated to:')
            || str_starts_with($firstText, 'migrated from:');
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
