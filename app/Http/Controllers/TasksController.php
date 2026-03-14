<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\User;
use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteSlugService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

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
            'workspace_id' => ['nullable', Rule::in($workspaceIds)],
            'workspace_ids' => ['nullable', 'array'],
            'workspace_ids.*' => [Rule::in($workspaceIds)],
            'note_scope_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'note_scope_ids' => ['nullable', 'array'],
            'note_scope_ids.*' => [
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'date_preset' => ['nullable', Rule::in(['today', 'this_week', 'this_month', 'today_plus_7'])],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date'],
            'status' => ['nullable', 'array'],
            'status.*' => ['string', Rule::in(['open', 'completed', 'canceled', 'migrated', 'assigned', 'in_progress', 'starred', 'backlog', 'question'])],
            'group_by' => ['nullable', Rule::in(['none', 'note', 'date'])],
            'show_completed' => ['nullable', 'boolean'],
            'hashtag' => ['nullable', 'string', 'max:120'],
        ]);

        $showCompleted = $request->boolean('show_completed');
        $hashtag = ltrim(trim((string) ($filters['hashtag'] ?? '')), '#');

        $selectedWorkspaceIds = collect($filters['workspace_ids'] ?? [])
            ->map(fn ($id) => is_string($id) ? trim($id) : '')
            ->filter(fn (string $id) => $id !== '')
            ->unique()
            ->values();

        if ($selectedWorkspaceIds->isEmpty() && is_string($filters['workspace_id'] ?? null) && $filters['workspace_id'] !== '') {
            $selectedWorkspaceIds = collect([(string) $filters['workspace_id']]);
        }

        $hasWorkspaceFilterInput = $request->has('workspace_ids') || $request->has('workspace_id');
        if (! $hasWorkspaceFilterInput && $selectedWorkspaceIds->isEmpty()) {
            $currentWorkspaceId = (string) ($user->currentWorkspace()?->id ?? '');
            if ($currentWorkspaceId !== '' && in_array($currentWorkspaceId, $workspaceIds, true)) {
                $selectedWorkspaceIds = collect([$currentWorkspaceId]);
            }
        }

        $selectedNoteScopeIds = collect($filters['note_scope_ids'] ?? [])
            ->map(fn ($id) => is_string($id) ? trim($id) : '')
            ->filter(fn (string $id) => $id !== '')
            ->unique()
            ->values();

        if ($selectedNoteScopeIds->isEmpty() && is_string($filters['note_scope_id'] ?? null) && $filters['note_scope_id'] !== '') {
            $selectedNoteScopeIds = collect([(string) $filters['note_scope_id']]);
        }

        $query = NoteTask::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->with([
                'note:id,title,slug,type,journal_granularity,journal_date,workspace_id',
                'note.workspace:id,name',
            ]);

        if (! $selectedWorkspaceIds->isEmpty()) {
            $query->whereIn('workspace_id', $selectedWorkspaceIds->all());
        }

        $selectedStatuses = collect($filters['status'] ?? [])
            ->map(fn ($status) => is_string($status) ? trim(strtolower($status)) : '')
            ->map(fn (string $status) => $status === 'question' ? 'backlog' : $status)
            ->filter(fn (string $status) => $status !== '')
            ->unique()
            ->values();

        if ($selectedStatuses->isEmpty()) {
            $selectedStatuses = $showCompleted
                ? collect(['open', 'completed'])
                : collect(['open']);
        }

        $query->where(function (Builder $statusQuery) use ($selectedStatuses): void {
            foreach ($selectedStatuses as $status) {
                $statusQuery->orWhere(function (Builder $inner) use ($status): void {
                    match ($status) {
                        'open' => $inner->where('checked', false)
                            ->where(function (Builder $sub): void {
                                $sub->whereNull('task_status')
                                    ->orWhereNotIn('task_status', ['canceled', 'migrated']);
                            }),
                        'completed' => $inner->where('checked', true),
                        'canceled' => $inner->where('task_status', 'canceled'),
                        'migrated' => $inner->where('task_status', 'migrated'),
                        'assigned' => $inner->where('task_status', 'assigned'),
                        'in_progress' => $inner->where('task_status', 'in_progress'),
                        'starred' => $inner->where('task_status', 'starred'),
                        'backlog' => $inner->whereIn('task_status', ['backlog', 'question']),
                        'question' => $inner->whereIn('task_status', ['backlog', 'question']),
                        default => $inner->whereRaw('1 = 0'),
                    };
                });
            }
        });

        if (! $selectedNoteScopeIds->isEmpty()) {
            $scopeIds = $selectedNoteScopeIds->all();
            $query->where(function ($inner) use ($scopeIds) {
                $inner->whereIn('note_id', $scopeIds)
                    ->orWhereIn('parent_note_id', $scopeIds);
            });
        }

        if ($hashtag !== '') {
            $query->whereJsonContains('hashtags', $hashtag);
        }

        $datePreset = is_string($filters['date_preset'] ?? null)
            ? trim((string) $filters['date_preset'])
            : '';

        $dateFrom = $filters['date_from'] ?? $filters['date_to'] ?? null;
        $dateTo = $filters['date_to'] ?? $filters['date_from'] ?? null;

        if ($datePreset !== '') {
            [$dateFrom, $dateTo] = $this->resolveDatePreset($datePreset);
        }

        if ($dateFrom || $dateTo) {

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
                })->orWhere(function ($sub) use ($dateFrom, $dateTo) {
                    $sub->whereNull('due_date')
                        ->whereNull('deadline_date')
                        ->whereNotNull('journal_date');

                    if ($dateFrom) {
                        $sub->whereDate('journal_date', '>=', $dateFrom);
                    }
                    if ($dateTo) {
                        $sub->whereDate('journal_date', '<=', $dateTo);
                    }
                });
            });
        }

        $query
            ->orderByRaw('due_date IS NULL')
            ->orderBy('due_date')
            ->orderBy('updated_at', 'desc');

        $tasks = $query
            ->paginate(50)
            ->withQueryString();

        $migrationNoteIds = $tasks->getCollection()
            ->flatMap(fn (NoteTask $task) => [$task->migrated_to_note_id, $task->migrated_from_note_id])
            ->filter(fn ($id) => is_string($id) && trim($id) !== '')
            ->map(fn (string $id) => trim($id))
            ->unique()
            ->values()
            ->all();

        /** @var array<string, Note> $migrationNotesById */
        $migrationNotesById = Note::query()
            ->whereIn('id', $migrationNoteIds)
            ->get(['id', 'workspace_id', 'slug', 'type', 'journal_granularity', 'journal_date', 'title'])
            ->keyBy('id')
            ->all();

        $tasks->setCollection(
            $tasks->getCollection()->map(function (NoteTask $task) use ($migrationNotesById, $workspaceNamesById): array {
                $note = $task->note;
                $migratedToNoteId = is_string($task->migrated_to_note_id)
                    ? trim($task->migrated_to_note_id)
                    : '';
                $migratedFromNoteId = is_string($task->migrated_from_note_id)
                    ? trim($task->migrated_from_note_id)
                    : '';
                $migratedToNote = $migratedToNoteId !== '' ? ($migrationNotesById[$migratedToNoteId] ?? null) : null;
                $migratedFromNote = $migratedFromNoteId !== '' ? ($migrationNotesById[$migratedFromNoteId] ?? null) : null;

                return [
                    'id' => $task->id,
                    'block_id' => $task->block_id,
                    'position' => $task->position,
                    'checked' => $task->checked,
                    'task_status' => $task->task_status,
                    'canceled_at' => $task->canceled_at?->toIso8601String(),
                    'completed_at' => $task->completed_at?->toIso8601String(),
                    'started_at' => $task->started_at?->toIso8601String(),
                    'backlog_promoted_at' => $task->backlog_promoted_at?->toIso8601String(),
                    'priority' => $task->priority,
                    'content' => $task->content_text,
                    'render_fragments' => $task->render_fragments ?? [],
                    'children' => $task->children ?? [],
                    'due_date' => $task->due_date?->toDateString(),
                    'deadline_date' => $task->deadline_date?->toDateString(),
                    'journal_date' => $task->journal_date?->toDateString(),
                    'mentions' => $task->mentions ?? [],
                    'hashtags' => $task->hashtags ?? [],
                    'migrated_to_note' => $migratedToNote ? [
                        'id' => $migratedToNote->id,
                        'title' => $migratedToNote->display_title,
                        'href' => $this->noteSlugService->urlFor($migratedToNote),
                    ] : null,
                    'migrated_from_note' => $migratedFromNote ? [
                        'id' => $migratedFromNote->id,
                        'title' => $migratedFromNote->display_title,
                        'href' => $this->noteSlugService->urlFor($migratedFromNote),
                    ] : null,
                    'note' => [
                        'id' => $task->note_id,
                        'title' => $task->note_title ?? 'Untitled',
                        'href' => $note ? $this->noteSlugService->urlFor($note) : null,
                        'workspace_id' => $task->workspace_id,
                        'workspace_name' => $note?->workspace?->name
                            ?? ($workspaceNamesById[(string) $task->workspace_id] ?? null),
                        'parent_id' => $task->parent_note_id,
                        'parent_title' => $task->parent_note_title,
                    ],
                    'updated_at' => $task->updated_at?->toIso8601String(),
                    'created_at' => $task->created_at?->toIso8601String(),
                ];
            }),
        );

        $notes = Note::query()
            ->whereIn('workspace_id', $workspaceIds)
            ->where(function ($query) {
                $query->whereNull('type')->orWhere('type', '!=', Note::TYPE_JOURNAL);
            })
            ->when(! $selectedWorkspaceIds->isEmpty(), fn ($query) => $query->whereIn('workspace_id', $selectedWorkspaceIds->all()))
            ->orderBy('title')
            ->get(['id', 'title', 'workspace_id'])
            ->map(fn (Note $note) => [
                'id' => $note->id,
                'title' => $note->title ?? 'Untitled',
                'workspace_id' => $note->workspace_id,
                'workspace_name' => $workspaceNamesById[$note->workspace_id] ?? null,
            ])
            ->values();

        $showWorkspacePrefixForNoteTree = $selectedWorkspaceIds->isEmpty()
            ? count($workspaceIds) > 1
            : $selectedWorkspaceIds->count() > 1;

        $noteTreeOptions = $this->buildNoteTreeOptions(
            $workspaceNamesById,
            $notes->toArray(),
            $selectedWorkspaceIds->all(),
            $showWorkspacePrefixForNoteTree,
        );

        return Inertia::render('tasks/index', [
            'tasks' => $tasks,
            'filters' => [
                'workspace_ids' => $selectedWorkspaceIds->values()->all(),
                'note_scope_ids' => $selectedNoteScopeIds->values()->all(),
                'date_preset' => $datePreset !== '' ? $datePreset : '',
                'date_from' => $dateFrom ?? '',
                'date_to' => $dateTo ?? '',
                'group_by' => $filters['group_by'] ?? 'none',
                'status' => $selectedStatuses->values()->all(),
                'show_completed' => $showCompleted,
                'hashtag' => $hashtag,
            ],
            'filterPresets' => $this->taskFilterPresetsForUser($user),
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

    public function saveFilterPreset(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $workspaceIds = $user->workspaces()->pluck('workspaces.id')->all();
        if ($workspaceIds === []) {
            abort(403, 'No workspace available.');
        }

        $validated = $request->validate([
            'preset_id' => ['nullable', 'string', 'max:64'],
            'name' => ['required', 'string', 'max:80'],
            'favorite' => ['nullable', 'boolean'],
            'filters' => ['required', 'array'],
            'filters.workspace_ids' => ['nullable', 'array'],
            'filters.workspace_ids.*' => [Rule::in($workspaceIds)],
            'filters.note_scope_ids' => ['nullable', 'array'],
            'filters.note_scope_ids.*' => [
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->whereIn('workspace_id', $workspaceIds)),
            ],
            'filters.date_preset' => ['nullable', Rule::in(['', 'today', 'this_week', 'this_month', 'today_plus_7'])],
            'filters.date_from' => ['nullable', 'date'],
            'filters.date_to' => ['nullable', 'date'],
            'filters.status' => ['nullable', 'array'],
            'filters.status.*' => ['string', Rule::in(['open', 'completed', 'canceled', 'migrated', 'assigned', 'in_progress', 'starred', 'backlog', 'question'])],
            'filters.group_by' => ['nullable', Rule::in(['none', 'note', 'date'])],
        ]);

        $normalizedFilters = $this->normalizeTaskPresetFilters((array) ($validated['filters'] ?? []));
        $name = trim((string) ($validated['name'] ?? ''));
        $favorite = (bool) ($validated['favorite'] ?? false);
        $presetId = is_string($validated['preset_id'] ?? null) ? trim((string) $validated['preset_id']) : '';
        $now = now()->toIso8601String();

        $settings = is_array($user->settings) ? $user->settings : [];
        $presets = collect(data_get($settings, 'tasks.filter_presets', []))
            ->filter(fn ($preset) => is_array($preset))
            ->map(function (array $preset): array {
                $id = is_string($preset['id'] ?? null) ? trim((string) $preset['id']) : '';
                $name = trim((string) ($preset['name'] ?? ''));
                if ($id === '' || $name === '') {
                    return [];
                }

                return [
                    'id' => $id,
                    'name' => $name,
                    'favorite' => (bool) ($preset['favorite'] ?? false),
                    'filters' => $this->normalizeTaskPresetFilters((array) ($preset['filters'] ?? [])),
                    'updated_at' => is_string($preset['updated_at'] ?? null) ? (string) $preset['updated_at'] : null,
                ];
            })
            ->filter(fn (array $preset) => $preset !== [])
            ->values();

        $foundIndex = $presetId !== ''
            ? $presets->search(fn (array $preset): bool => $preset['id'] === $presetId)
            : false;

        if ($foundIndex !== false) {
            $presets->put((int) $foundIndex, [
                'id' => $presetId,
                'name' => $name,
                'favorite' => $favorite,
                'filters' => $normalizedFilters,
                'updated_at' => $now,
            ]);
        } else {
            $newPresetId = (string) Str::uuid();
            $presets->prepend([
                'id' => $newPresetId,
                'name' => $name,
                'favorite' => $favorite,
                'filters' => $normalizedFilters,
                'updated_at' => $now,
            ]);
        }

        data_set($settings, 'tasks.filter_presets', $presets->values()->all());
        $user->forceFill(['settings' => $settings])->save();

        return back();
    }

    public function deleteFilterPreset(Request $request, string $presetId)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $settings = is_array($user->settings) ? $user->settings : [];
        $presets = collect(data_get($settings, 'tasks.filter_presets', []))
            ->filter(fn ($preset) => is_array($preset))
            ->reject(fn (array $preset): bool => (string) ($preset['id'] ?? '') === $presetId)
            ->values()
            ->all();

        data_set($settings, 'tasks.filter_presets', $presets);
        $user->forceFill(['settings' => $settings])->save();

        return back();
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
            'promote_backlog' => ['nullable', 'boolean'],
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

        $promoteBacklog = (bool) ($data['promote_backlog'] ?? false);
        if (! $promoteBacklog && (bool) $data['checked'] && $task->task_status === 'backlog' && ! $task->checked) {
            $promoteBacklog = true;
        }
        $promotionTimestamp = Carbon::now()->toIso8601String();

        $updated = false;
        if (is_string($task->block_id) && $task->block_id !== '') {
            $updated = $this->updateTaskItemCheckedByBlockId(
                $content,
                $task->block_id,
                (bool) $data['checked'],
                $promoteBacklog,
                $promotionTimestamp,
            );
        }

        if (! $updated) {
            $updated = $this->updateTaskItemCheckedByPosition(
                $content,
                (int) $task->position,
                (bool) $data['checked'],
                $promoteBacklog,
                $promotionTimestamp,
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
            'promote_backlog' => ['nullable', 'boolean'],
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

        $promoteBacklog = (bool) ($data['promote_backlog'] ?? false);
        $promotionTimestamp = Carbon::now()->toIso8601String();

        $updated = false;
        if (is_string($data['block_id'] ?? null) && trim((string) $data['block_id']) !== '') {
            $updated = $this->updateTaskItemCheckedByBlockId(
                $content,
                trim((string) $data['block_id']),
                (bool) $data['checked'],
                $promoteBacklog,
                $promotionTimestamp,
            );
        }

        if (! $updated) {
            $position = (int) ($data['position'] ?? 0);
            if ($position > 0) {
                $updated = $this->updateTaskItemCheckedByPosition(
                    $content,
                    $position,
                    (bool) $data['checked'],
                    $promoteBacklog,
                    $promotionTimestamp,
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
        $language = $this->userLanguage($user);
        $longDateFormat = $this->userLongDateFormat($user);
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
            $title = $this->journalNoteService->titleFor(
                $granularity,
                $date,
                $language,
                $longDateFormat,
            );
            $key = "{$granularity}:{$date->toDateString()}";
            $existing = $journalByKey->get($key);

            $items[] = [
                'key' => "journal:{$granularity}:{$period}",
                'title' => $title,
                'path' => $this->noteSlugService->journalUrlFor($sourceNote->workspace, $granularity, $period),
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
                $this->userLanguage($user),
                $this->userLongDateFormat($user),
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
     * @param  array<int, string>  $workspaceIds
     * @return array<int, array{id: string, title: string, depth: int, workspace_id: string, workspace_name: string|null}>
     */
    private function buildNoteTreeOptions(
        array $workspaceNamesById,
        array $notes,
        array $workspaceIds,
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

        $filteredNodes = collect($notes)
            ->filter(function (array $note) use ($workspaceIds): bool {
                if ($workspaceIds === []) {
                    return true;
                }

                return in_array($note['workspace_id'], $workspaceIds, true);
            })
            ->values();

        $filteredNodeIds = $filteredNodes->pluck('id')->flip()->all();

        /** @var array<string, array<int, string>> $childrenByParent */
        $childrenByParent = [];
        /** @var array<string, array<int, string>> $rootIdsByWorkspace */
        $rootIdsByWorkspace = [];

        foreach ($filteredNodes as $note) {
            $id = (string) $note['id'];
            $parentId = $nodeById[$id]['parent_id'] ?? null;
            $workspaceId = (string) $note['workspace_id'];

            if (is_string($parentId) && $parentId !== '' && isset($filteredNodeIds[$parentId])) {
                $childrenByParent[$parentId] ??= [];
                $childrenByParent[$parentId][] = $id;
            } else {
                $rootIdsByWorkspace[$workspaceId] ??= [];
                $rootIdsByWorkspace[$workspaceId][] = $id;
            }
        }

        $sortIdsByTitle = function (array $ids) use ($nodeById): array {
            usort(
                $ids,
                fn (string $a, string $b) => strcasecmp(
                    (string) ($nodeById[$a]['title'] ?? ''),
                    (string) ($nodeById[$b]['title'] ?? ''),
                )
            );

            return $ids;
        };

        foreach ($rootIdsByWorkspace as $workspaceId => $ids) {
            $rootIdsByWorkspace[$workspaceId] = $sortIdsByTitle($ids);
        }
        foreach ($childrenByParent as $parentId => $ids) {
            $childrenByParent[$parentId] = $sortIdsByTitle($ids);
        }

        $workspaceOrder = array_keys($rootIdsByWorkspace);
        usort(
            $workspaceOrder,
            fn (string $a, string $b) => strcasecmp(
                (string) ($workspaceNamesById[$a] ?? ''),
                (string) ($workspaceNamesById[$b] ?? ''),
            )
        );

        $rows = [];
        $appendNode = function (string $id, int $depth, string $workspaceId) use (&$appendNode, &$rows, $nodeById, $childrenByParent, $workspaceNamesById, $showWorkspacePrefix): void {
            $rows[] = [
                'id' => $id,
                'title' => (string) ($nodeById[$id]['title'] ?? 'Untitled'),
                'depth' => $depth,
                'workspace_id' => $workspaceId,
                'workspace_name' => $showWorkspacePrefix ? ($workspaceNamesById[$workspaceId] ?? 'Workspace') : null,
            ];

            foreach ($childrenByParent[$id] ?? [] as $childId) {
                $appendNode($childId, $depth + 1, $workspaceId);
            }
        };

        foreach ($workspaceOrder as $workspaceId) {
            foreach ($rootIdsByWorkspace[$workspaceId] ?? [] as $rootId) {
                $appendNode($rootId, 0, $workspaceId);
            }
        }

        return $rows;
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

            if ($this->isBlockTaskParagraphNode($node)) {
                $counter += 1;
                $nodeAttrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
                $nodeBlockId = is_string($nodeAttrs['id'] ?? null) ? (string) $nodeAttrs['id'] : null;
                $isMatch = ($blockId !== null && $blockId !== '' && $nodeBlockId === $blockId)
                    || (($blockId === null || $blockId === '') && $targetPosition > 0 && $counter === $targetPosition);

                if ($isMatch) {
                    $sourceTaskBlockId = $nodeBlockId && $nodeBlockId !== ''
                        ? $nodeBlockId
                        : (string) Str::uuid();
                    $migrationTimestamp = Carbon::now()->toIso8601String();

                    $baseTask = $node;
                    $baseAttrs = is_array($baseTask['attrs'] ?? null) ? $baseTask['attrs'] : [];
                    $baseAttrs['id'] = $sourceTaskBlockId;

                    $node = $baseTask;
                    $node['attrs'] = array_merge($baseAttrs, [
                        'blockStyle' => 'task',
                        'checked' => false,
                        'taskStatus' => 'migrated',
                        'migratedAt' => $migrationTimestamp,
                        'migratedToNoteId' => (string) $targetNote->id,
                        'migratedFromNoteId' => null,
                        'migratedFromBlockId' => null,
                    ]);

                    $newTaskId = (string) Str::uuid();
                    $clonedTask = $baseTask;
                    $clonedTask['attrs'] = array_merge($baseAttrs, [
                        'id' => $newTaskId,
                        'blockStyle' => 'task',
                        'checked' => false,
                        'taskStatus' => null,
                        'migratedAt' => $migrationTimestamp,
                        'migratedToNoteId' => null,
                        'migratedFromNoteId' => (string) $sourceNote->id,
                        'migratedFromBlockId' => $sourceTaskBlockId,
                    ]);

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
     * @return array{0: string, 1: string}
     */
    private function resolveDatePreset(string $preset): array
    {
        $today = CarbonImmutable::instance(Carbon::now())->startOfDay();

        return match ($preset) {
            'today' => [
                $today->toDateString(),
                $today->toDateString(),
            ],
            'this_week' => [
                $today->startOfWeek()->toDateString(),
                $today->endOfWeek()->toDateString(),
            ],
            'this_month' => [
                $today->startOfMonth()->toDateString(),
                $today->endOfMonth()->toDateString(),
            ],
            'today_plus_7' => [
                $today->toDateString(),
                $today->addDays(7)->toDateString(),
            ],
            default => [
                $today->toDateString(),
                $today->toDateString(),
            ],
        };
    }

    /**
     * @return array<int, array{id:string,name:string,favorite:bool,filters:array<string,mixed>,updated_at:?string}>
     */
    private function taskFilterPresetsForUser($user): array
    {
        $settings = is_array($user?->settings) ? $user->settings : [];

        return collect(data_get($settings, 'tasks.filter_presets', []))
            ->filter(fn ($preset) => is_array($preset))
            ->map(function (array $preset): array {
                return [
                    'id' => is_string($preset['id'] ?? null) ? (string) $preset['id'] : '',
                    'name' => is_string($preset['name'] ?? null) ? trim((string) $preset['name']) : '',
                    'favorite' => (bool) ($preset['favorite'] ?? false),
                    'filters' => $this->normalizeTaskPresetFilters((array) ($preset['filters'] ?? [])),
                    'updated_at' => is_string($preset['updated_at'] ?? null) ? (string) $preset['updated_at'] : null,
                ];
            })
            ->filter(fn (array $preset) => $preset['id'] !== '' && $preset['name'] !== '')
            ->sortByDesc(fn (array $preset) => $preset['favorite'] ? 1 : 0)
            ->values()
            ->all();
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array{
     *   workspace_ids: array<int, string>,
     *   note_scope_ids: array<int, string>,
     *   date_preset: string,
     *   date_from: string,
     *   date_to: string,
     *   status: array<int, string>,
     *   group_by: 'none'|'note'|'date'
     * }
     */
    private function normalizeTaskPresetFilters(array $filters): array
    {
        $workspaceIds = collect($filters['workspace_ids'] ?? [])
            ->filter(fn ($id) => is_string($id) && trim($id) !== '')
            ->map(fn (string $id) => trim($id))
            ->unique()
            ->values()
            ->all();

        $noteScopeIds = collect($filters['note_scope_ids'] ?? [])
            ->filter(fn ($id) => is_string($id) && trim($id) !== '')
            ->map(fn (string $id) => trim($id))
            ->unique()
            ->values()
            ->all();

        $datePreset = is_string($filters['date_preset'] ?? null) ? trim((string) $filters['date_preset']) : '';
        if (! in_array($datePreset, ['', 'today', 'this_week', 'this_month', 'today_plus_7'], true)) {
            $datePreset = '';
        }

        $statuses = collect($filters['status'] ?? [])
            ->filter(fn ($status) => is_string($status) && trim($status) !== '')
            ->map(fn (string $status) => trim(strtolower($status)))
            ->map(fn (string $status) => $status === 'question' ? 'backlog' : $status)
            ->filter(fn (string $status) => in_array($status, ['open', 'completed', 'canceled', 'migrated', 'assigned', 'in_progress', 'starred', 'backlog'], true))
            ->unique()
            ->values()
            ->all();

        $groupBy = is_string($filters['group_by'] ?? null) ? trim((string) $filters['group_by']) : 'none';
        if (! in_array($groupBy, ['none', 'note', 'date'], true)) {
            $groupBy = 'none';
        }

        return [
            'workspace_ids' => $workspaceIds,
            'note_scope_ids' => $noteScopeIds,
            'date_preset' => $datePreset,
            'date_from' => is_string($filters['date_from'] ?? null) ? trim((string) $filters['date_from']) : '',
            'date_to' => is_string($filters['date_to'] ?? null) ? trim((string) $filters['date_to']) : '',
            'status' => $statuses !== [] ? $statuses : ['open'],
            'group_by' => $groupBy,
        ];
    }

    private function userLanguage(User $user): string
    {
        $language = strtolower((string) data_get($user->settings, 'language', 'nl'));

        return in_array($language, ['nl', 'en'], true) ? $language : 'nl';
    }

    private function userLongDateFormat(User $user): string
    {
        $value = strtolower((string) data_get($user->settings, 'date_long_format', ''));
        $allowed = [
            'weekday_day_month_year',
            'weekday_month_day_year',
            'day_month_year',
            'iso_date',
        ];

        if (in_array($value, $allowed, true)) {
            return $value;
        }

        return 'weekday_day_month_year';
    }

    /**
     * @param  array<int, mixed>  $docContent
     * @param  array<string, mixed>  $taskItem
     */
    private function appendTaskToDocumentEnd(array &$docContent, array $taskItem): void
    {
        if ($this->isBlockTaskParagraphNode($taskItem)) {
            $docContent[] = $taskItem;

            return;
        }

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

    /**
     * @param  array<string, mixed>  $node
     */
    private function isBlockTaskParagraphNode(array $node): bool
    {
        if (($node['type'] ?? null) !== 'paragraph') {
            return false;
        }

        $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];

        return ($attrs['blockStyle'] ?? null) === 'task';
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
    private function updateTaskItemCheckedByBlockId(
        array &$content,
        string $blockId,
        bool $checked,
        bool $promoteBacklog,
        string $promotionTimestamp,
    ): bool {
        if (! isset($content['content']) || ! is_array($content['content'])) {
            return false;
        }

        return $this->walkAndUpdateByBlockId(
            $content['content'],
            $blockId,
            $checked,
            $promoteBacklog,
            $promotionTimestamp,
        );
    }

    /**
     * @param  array<int, mixed>  $nodes
     */
    private function walkAndUpdateByBlockId(
        array &$nodes,
        string $blockId,
        bool $checked,
        bool $promoteBacklog,
        string $promotionTimestamp,
    ): bool {
        foreach ($nodes as &$node) {
            if (! is_array($node)) {
                continue;
            }

            if (($node['type'] ?? null) === 'taskItem' && (($node['attrs']['id'] ?? null) === $blockId)) {
                $this->applyTaskCheckedUpdate(
                    $node,
                    $checked,
                    $promoteBacklog,
                    $promotionTimestamp,
                );

                return true;
            }

            if (isset($node['content']) && is_array($node['content'])) {
                if ($this->walkAndUpdateByBlockId(
                    $node['content'],
                    $blockId,
                    $checked,
                    $promoteBacklog,
                    $promotionTimestamp,
                )) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $content
     */
    private function updateTaskItemCheckedByPosition(
        array &$content,
        int $targetPosition,
        bool $checked,
        bool $promoteBacklog,
        string $promotionTimestamp,
    ): bool {
        if (! isset($content['content']) || ! is_array($content['content'])) {
            return false;
        }

        $position = 0;

        return $this->walkAndUpdateByPosition(
            $content['content'],
            $targetPosition,
            $position,
            $checked,
            $promoteBacklog,
            $promotionTimestamp,
        );
    }

    /**
     * @param  array<int, mixed>  $nodes
     */
    private function walkAndUpdateByPosition(
        array &$nodes,
        int $targetPosition,
        int &$position,
        bool $checked,
        bool $promoteBacklog,
        string $promotionTimestamp,
    ): bool {
        foreach ($nodes as &$node) {
            if (! is_array($node)) {
                continue;
            }

            if (($node['type'] ?? null) === 'taskItem') {
                $position++;
                if ($position === $targetPosition) {
                    $this->applyTaskCheckedUpdate(
                        $node,
                        $checked,
                        $promoteBacklog,
                        $promotionTimestamp,
                    );

                    return true;
                }
            }

            if (isset($node['content']) && is_array($node['content'])) {
                if ($this->walkAndUpdateByPosition(
                    $node['content'],
                    $targetPosition,
                    $position,
                    $checked,
                    $promoteBacklog,
                    $promotionTimestamp,
                )) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $taskItem
     */
    private function applyTaskCheckedUpdate(
        array &$taskItem,
        bool $checked,
        bool $promoteBacklog,
        string $promotionTimestamp,
    ): void {
        $attrs = is_array($taskItem['attrs'] ?? null) ? $taskItem['attrs'] : [];
        $status = strtolower(trim((string) ($attrs['taskStatus'] ?? '')));
        $isOpenBacklog = in_array($status, ['backlog', 'question'], true)
            && ! (bool) ($attrs['checked'] ?? false);
        $shouldPromote = $isOpenBacklog && ($promoteBacklog || $checked);

        if ($shouldPromote) {
            $attrs['checked'] = false;
            $attrs['taskStatus'] = null;
            $attrs['backlogPromotedAt'] = $promotionTimestamp;
            $attrs['completedAt'] = null;
            $taskItem['attrs'] = $attrs;
            $this->stripLeadingBacklogMarkerFromTaskItem($taskItem);

            return;
        }

        $attrs['checked'] = $checked;
        $attrs['completedAt'] = $checked ? $promotionTimestamp : null;
        $taskItem['attrs'] = $attrs;
    }

    /**
     * @param  array<string, mixed>  $taskItem
     */
    private function stripLeadingBacklogMarkerFromTaskItem(array &$taskItem): void
    {
        if (! isset($taskItem['content']) || ! is_array($taskItem['content'])) {
            return;
        }

        $removed = false;
        $walk = function (array &$nodes) use (&$walk, &$removed): void {
            foreach ($nodes as &$node) {
                if ($removed || ! is_array($node)) {
                    continue;
                }

                if (($node['type'] ?? null) === 'text' && is_string($node['text'] ?? null)) {
                    $text = (string) $node['text'];
                    $updated = preg_replace('/^(\s*)\?\s+/u', '$1', $text, 1, $count);
                    if ($count > 0 && is_string($updated)) {
                        $node['text'] = $updated;
                        $removed = true;

                        return;
                    }
                }

                $children = $node['content'] ?? null;
                if (is_array($children)) {
                    $walk($children);
                    $node['content'] = $children;
                }
            }
        };

        $content = $taskItem['content'];
        $walk($content);
        $taskItem['content'] = $content;
    }
}
