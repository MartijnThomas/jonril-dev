<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Models\NoteRevision;
use App\Models\NoteTask;
use App\Models\Workspace;
use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteRelatedPanelBuilder;
use App\Support\Notes\NoteRevisionRecorder;
use App\Support\Notes\NoteSlugService;
use App\Support\Notes\NoteTitleExtractor;
use App\Support\Notes\NoteWordCountExtractor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use InvalidArgumentException;

class NotesController extends Controller
{
    public function __construct(
        private readonly NoteTitleExtractor $noteTitleExtractor,
        private readonly NoteRevisionRecorder $noteRevisionRecorder,
        private readonly NoteSlugService $noteSlugService,
        private readonly JournalNoteService $journalNoteService,
        private readonly NoteWordCountExtractor $noteWordCountExtractor,
        private readonly NoteRelatedPanelBuilder $noteRelatedPanelBuilder,
    ) {}

    public function start(Request $request)
    {
        $data = $request->validate([
            'parent_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(
                    fn ($query) => $query->where('workspace_id', $this->currentWorkspace()->id),
                ),
            ],
            'title' => ['nullable', 'string', 'max:255'],
        ]);

        $workspace = $this->currentWorkspace();
        $title = trim((string) ($data['title'] ?? ''));
        $initialContent = null;
        $initialWordCount = 0;

        if ($workspace->editor_mode === Workspace::EDITOR_MODE_BLOCK) {
            $headingText = $title !== '' ? $title : '';
            $initialContent = [
                'type' => 'doc',
                'content' => [
                    [
                        'type' => 'heading',
                        'attrs' => ['level' => 1],
                        'content' => [
                            ['type' => 'text', 'text' => $headingText],
                        ],
                    ],
                ],
            ];
            $initialWordCount = $this->noteWordCountExtractor->count($initialContent);
        }

        /** @var Note $note */
        $note = $workspace->notes()->create([
            'type' => Note::TYPE_NOTE,
            'parent_id' => $data['parent_id'] ?? null,
            'title' => $title !== '' ? $title : null,
            'content' => $initialContent,
            'word_count' => $initialWordCount,
        ]);

        $this->noteSlugService->syncSingleNote($note);

        return redirect($this->noteSlugService->urlFor($note));
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'parent_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(
                    fn ($query) => $query->where('workspace_id', $this->currentWorkspace()->id),
                ),
            ],
        ]);

        $workspace = $this->currentWorkspace();
        $title = trim((string) ($data['title'] ?? ''));
        if ($title === '') {
            throw ValidationException::withMessages([
                'title' => 'The title field is required.',
            ]);
        }

        /** @var Note $note */
        $note = DB::transaction(function () use ($workspace, $data, $title): Note {
            $content = [
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

            /** @var Note $created */
            $created = $workspace->notes()->create([
                'type' => Note::TYPE_NOTE,
                'parent_id' => $data['parent_id'] ?? null,
                'title' => $title,
                'content' => $content,
                'properties' => [],
                'word_count' => $this->noteWordCountExtractor->count($content),
            ]);

            $this->noteSlugService->syncSingleNote($created);

            return $created->fresh();
        });

        return redirect($this->noteSlugService->urlFor($note));
    }

    public function index(Request $request)
    {
        $filters = $this->validateNotesListFilters($request);
        $roots = $this->buildNotesTreeLevel($this->currentWorkspace()->id, null, $filters);

        return Inertia::render('notes/index', [
            'roots' => $roots,
            'filters' => $filters,
        ]);
    }

    public function tree(Request $request): JsonResponse
    {
        $filters = $this->validateNotesListFilters($request);
        $data = $request->validate([
            'parent_id' => ['nullable', 'string', 'max:60'],
        ]);

        $nodes = $this->buildNotesTreeLevel(
            $this->currentWorkspace()->id,
            $data['parent_id'] ?? null,
            $filters,
        );

        return response()->json([
            'nodes' => $nodes,
        ]);
    }

    public function show(string $note)
    {
        $resolved = $this->resolveNoteOrFail($note);

        return $this->renderNotePage($resolved);
    }

    public function showScoped(Workspace $workspace, string $note)
    {
        $this->assertWorkspaceMembership($workspace);
        $resolved = $this->resolveNoteOrFailInWorkspace($workspace, $note);

        return $this->renderNotePage($resolved);
    }

    public function showJournal(Request $request, string $granularity, string $period)
    {
        return $this->showJournalForWorkspace(
            request: $request,
            workspace: $this->currentWorkspace(),
            granularity: $granularity,
            period: $period,
        );
    }

    public function showJournalScoped(Request $request, Workspace $workspace, string $granularity, string $period)
    {
        $this->assertWorkspaceMembership($workspace);

        return $this->showJournalForWorkspace(
            request: $request,
            workspace: $workspace,
            granularity: $granularity,
            period: $period,
        );
    }

    public function showJournalByPeriod(Request $request, string $period)
    {
        $granularity = $this->resolveJournalGranularityFromPeriod($period);
        abort_if($granularity === null, 404);

        return $this->showJournalForWorkspace(
            request: $request,
            workspace: $this->currentWorkspace(),
            granularity: $granularity,
            period: $period,
        );
    }

    public function showJournalScopedByPeriod(Request $request, Workspace $workspace, string $period)
    {
        $this->assertWorkspaceMembership($workspace);
        $granularity = $this->resolveJournalGranularityFromPeriod($period);
        abort_if($granularity === null, 404);

        return $this->showJournalForWorkspace(
            request: $request,
            workspace: $workspace,
            granularity: $granularity,
            period: $period,
        );
    }

    private function showJournalForWorkspace(
        Request $request,
        Workspace $workspace,
        string $granularity,
        string $period,
    ) {
        try {
            $note = $this->journalNoteService->resolveOrCreate(
                $workspace,
                $granularity,
                $period,
                $this->userLanguage(),
                $this->userLongDateFormat(),
            );
        } catch (InvalidArgumentException) {
            abort(404);
        }

        return $this->renderNotePage($note);
    }

    private function resolveJournalGranularityFromPeriod(string $period): ?string
    {
        $normalizedPeriod = trim($period);
        $granularities = [
            Note::JOURNAL_DAILY,
            Note::JOURNAL_WEEKLY,
            Note::JOURNAL_MONTHLY,
            Note::JOURNAL_YEARLY,
        ];

        foreach ($granularities as $granularity) {
            try {
                $this->journalNoteService->parsePeriod($granularity, $normalizedPeriod);

                return $granularity;
            } catch (InvalidArgumentException) {
                continue;
            }
        }

        return null;
    }

    public function update(Request $request, string $note)
    {
        return $this->updateForWorkspace($request, $this->currentWorkspace(), $note);
    }

    public function updateScoped(Request $request, Workspace $workspace, string $note)
    {
        $this->assertWorkspaceMembership($workspace);

        return $this->updateForWorkspace($request, $workspace, $note);
    }

    private function updateForWorkspace(Request $request, Workspace $workspace, string $note)
    {
        $resolved = $this->resolveNoteOrFailInWorkspace($workspace, $note);

        $data = $request->validate([
            'content' => 'required',
            'properties' => 'nullable|array',
            'save_mode' => ['sometimes', Rule::in(['auto', 'manual'])],
            'parent_id' => [
                'sometimes',
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(
                    fn ($query) => $query->where('workspace_id', $workspace->id),
                ),
            ],
        ]);

        if (array_key_exists('parent_id', $data)) {
            $this->assertParentAssignmentIsValid($resolved, $data['parent_id']);
            $resolved->parent_id = $data['parent_id'];
        }

        $properties = $this->sanitizeProperties($data['properties'] ?? null);

        $resolved->content = $data['content'];
        $resolved->properties = $properties;
        if ($resolved->type !== Note::TYPE_JOURNAL) {
            $resolved->title = $this->noteTitleExtractor->extract($data['content']);
        }
        $resolved->word_count = $this->noteWordCountExtractor->count($data['content']);
        $resolved->save();

        if ($resolved->type === Note::TYPE_NOTE) {
            $this->noteSlugService->syncNoteAndDescendants($resolved);
        }

        $this->noteRevisionRecorder->record(
            note: $resolved,
            user: $request->user(),
            saveMode: $data['save_mode'] ?? 'auto',
        );

        $isInertiaRequest = $request->header('X-Inertia') !== null;
        if ($request->expectsJson() && ! $isInertiaRequest) {
            return response()->json([
                'note_url' => $this->noteSlugService->urlFor($resolved),
                'note_update_url' => $this->noteSlugService->updateUrlFor($resolved),
            ]);
        }

        return Inertia::back();
    }

    public function rename(Request $request, string $noteId)
    {
        $note = $this->currentWorkspace()
            ->notes()
            ->where('id', $noteId)
            ->firstOrFail();

        if ($note->type !== Note::TYPE_NOTE) {
            abort(404);
        }

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
        ]);

        $title = trim($data['title']);
        if ($title === '') {
            throw ValidationException::withMessages([
                'title' => 'The title field is required.',
            ]);
        }

        $note->title = $title;
        $note->content = $this->replaceFirstHeadingLevelOneText($note->content, $title);
        $note->save();

        $this->noteSlugService->syncNoteAndDescendants($note);

        return redirect($this->noteSlugService->urlFor($note));
    }

    public function move(Request $request, string $noteId)
    {
        $note = $this->currentWorkspace()
            ->notes()
            ->where('id', $noteId)
            ->firstOrFail();

        if ($note->type !== Note::TYPE_NOTE) {
            abort(404);
        }

        $data = $request->validate([
            'parent_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(
                    fn ($query) => $query->where('workspace_id', $this->currentWorkspace()->id),
                ),
            ],
        ]);

        $nextParentId = $data['parent_id'] ?? null;
        $this->assertParentAssignmentIsValid($note, $nextParentId);

        $note->parent_id = $nextParentId;
        $note->save();

        $this->noteSlugService->syncNoteAndDescendants($note);

        return redirect($this->noteSlugService->urlFor($note));
    }

    public function destroy(string $noteId)
    {
        $note = $this->currentWorkspace()
            ->notes()
            ->where('id', $noteId)
            ->firstOrFail();

        if ($note->type !== Note::TYPE_NOTE) {
            abort(404);
        }

        $note->delete();

        return redirect()->route('notes.index');
    }

    public function clear(string $noteId)
    {
        $note = $this->currentWorkspace()
            ->notes()
            ->where('id', $noteId)
            ->firstOrFail();

        $title = (string) ($note->getRawOriginal('title') ?: $note->title ?: 'Untitled');

        $note->content = [
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
        $note->properties = [];
        $note->save();

        return back();
    }

    private function renderNotePage(Note $note)
    {
        if ($note->type === Note::TYPE_NOTE) {
            $this->noteSlugService->syncSingleNote($note);
        }

        $allNotes = Note::query()
            ->where('workspace_id', $this->currentWorkspace()->id)
            ->orderBy('created_at')
            ->get([
                'id',
                'workspace_id',
                'slug',
                'title',
                'properties',
                'meta',
                'parent_id',
                'type',
                'journal_granularity',
                'journal_date',
            ]);

        $pathById = [];
        $noteById = $allNotes->keyBy('id');

        $resolvePath = function (string $noteId) use (&$resolvePath, &$pathById, $noteById): string {
            if (isset($pathById[$noteId])) {
                return $pathById[$noteId];
            }

            /** @var Note|null $current */
            $current = $noteById->get($noteId);
            if (! $current) {
                return '';
            }

            $title = $current->title ?? 'Untitled';
            if (! $current->parent_id) {
                $pathById[$noteId] = $title;

                return $title;
            }

            $parentPath = $resolvePath($current->parent_id);
            $path = $parentPath !== '' ? "{$parentPath} / {$title}" : $title;
            $pathById[$noteId] = $path;

            return $path;
        };

        $buildTrail = function (string $noteId) use ($noteById): array {
            $trail = [];
            $visited = [];
            $cursor = $noteById->get($noteId);

            while ($cursor !== null && ! isset($visited[$cursor->id])) {
                $visited[$cursor->id] = true;
                $trail[] = [
                    'id' => $cursor->id,
                    'title' => $cursor->title ?? 'Untitled',
                ];

                if (! $cursor->parent_id) {
                    break;
                }

                $cursor = $noteById->get($cursor->parent_id);
            }

            return array_reverse($trail);
        };

        $linkableNotes = $allNotes
            ->map(fn (Note $linkableNote) => [
                'id' => $linkableNote->id,
                'title' => $linkableNote->title ?? 'Untitled',
                'path' => $linkableNote->parent_id
                    ? $resolvePath($linkableNote->parent_id)
                    : null,
                'href' => $this->noteSlugService->urlFor($linkableNote),
                'headings' => $this->extractLinkableHeadings($linkableNote),
            ])
            ->values();

        $childrenByParent = $allNotes
            ->filter(fn (Note $candidate) => $candidate->parent_id !== null)
            ->groupBy('parent_id');
        $excludedMoveTargetIds = [$note->id => true];
        $queue = [$note->id];

        while ($queue !== []) {
            $parentId = array_shift($queue);
            $children = $childrenByParent->get($parentId, collect());
            foreach ($children as $child) {
                if (isset($excludedMoveTargetIds[$child->id])) {
                    continue;
                }

                $excludedMoveTargetIds[$child->id] = true;
                $queue[] = $child->id;
            }
        }

        $moveParentOptions = $allNotes
            ->filter(fn (Note $candidate) => ! isset($excludedMoveTargetIds[$candidate->id]))
            ->filter(fn (Note $candidate) => $candidate->type === Note::TYPE_NOTE)
            ->map(fn (Note $candidate) => [
                'id' => $candidate->id,
                'title' => $candidate->display_title,
                'path' => $candidate->path,
            ])
            ->sortBy(fn (array $candidate) => strtolower($candidate['path']))
            ->values();

        $noteTrail = $buildTrail($note->id);
        if ($noteTrail === []) {
            $noteTrail = [[
                'id' => $note->id,
                'title' => $note->title ?? 'Untitled',
            ]];
        }

        $breadcrumbs = $this->buildBreadcrumbs($note, $noteTrail, $noteById, $this->currentWorkspace());
        [$noteActionIcon, $noteActionIconColor] = $this->resolveNoteActionIconPayload($note);

        return Inertia::render('notes/show', [
            'content' => $this->normalizeContentForEditor($note->content),
            'noteId' => $note->id,
            'noteUrl' => $this->noteSlugService->urlFor($note),
            'noteUpdateUrl' => $this->noteSlugService->updateUrlFor($note),
            'noteType' => $note->type,
            'journalGranularity' => $note->journal_granularity,
            'journalDate' => $note->journal_date?->toDateString(),
            'journalPeriod' => ($note->type === Note::TYPE_JOURNAL && $note->journal_granularity && $note->journal_date)
                ? $this->journalNoteService->periodFor($note->journal_granularity, $note->journal_date)
                : null,
            'defaultTimeblockDurationMinutes' => Auth::user()?->defaultTimeblockDurationMinutes() ?? 60,
            'editorMode' => $this->currentWorkspace()->editor_mode,
            'noteActions' => [
                'id' => $note->id,
                'title' => (string) ($note->getRawOriginal('title') ?: $note->title ?: 'Untitled'),
                'path' => $note->path,
                'parent_id' => $note->parent_id,
                'parent_path' => $note->parent_id ? $resolvePath($note->parent_id) : null,
                'type' => $note->type,
                'journal_granularity' => $note->journal_granularity,
                'icon' => $noteActionIcon,
                'icon_color' => $noteActionIconColor,
                'canRename' => $note->type === Note::TYPE_NOTE,
                'canDelete' => $note->type === Note::TYPE_NOTE,
                'canClear' => true,
                'canMove' => $note->type === Note::TYPE_NOTE,
            ],
            'properties' => $note->properties ?? [],
            'linkableNotes' => $linkableNotes,
            'moveParentOptions' => $moveParentOptions,
            'breadcrumbs' => $breadcrumbs,
            'language' => $this->userLanguage(),
            'relatedTasks' => Inertia::defer(function () use ($note) {
                return $this->noteRelatedPanelBuilder->tasks($note);
            }, 'related-panel'),
            'backlinks' => Inertia::defer(function () use ($note) {
                return $this->noteRelatedPanelBuilder->backlinks($note);
            }, 'related-panel'),
            'workspaceSuggestions' => [
                'mentions' => $this->normalizeWorkspaceSuggestions($this->currentWorkspace()->mention_suggestions),
                'hashtags' => $this->normalizeWorkspaceSuggestions($this->currentWorkspace()->hashtag_suggestions),
            ],
        ]);
    }

    /**
     * @return array{0: string|null, 1: string|null}
     */
    private function resolveNoteActionIconPayload(Note $note): array
    {
        if ($note->type === Note::TYPE_JOURNAL) {
            $granularity = $note->journal_granularity ?: Note::JOURNAL_DAILY;
            $settings = Auth::user()?->settings;
            $icon = data_get($settings, "editor.journal_icons.{$granularity}")
                ?: (Note::JOURNAL_ICON_DEFAULTS[$granularity] ?? Note::JOURNAL_ICON_DEFAULTS[Note::JOURNAL_DAILY]);
            $iconColor = data_get($settings, "editor.journal_icon_colors.{$granularity}")
                ?: Note::JOURNAL_ICON_COLOR_DEFAULT;

            return [
                is_string($icon) ? $icon : null,
                is_string($iconColor) ? $iconColor : Note::JOURNAL_ICON_COLOR_DEFAULT,
            ];
        }

        return [
            $note->icon,
            $note->icon_color,
        ];
    }

    /**
     * @return array<int, array{id: string, title: string, level: int|null}>
     */
    private function extractLinkableHeadings(Note $note): array
    {
        $meta = is_array($note->meta) ? $note->meta : [];
        $navigation = is_array($meta['navigation'] ?? null)
            ? $meta['navigation']
            : [];

        return collect($navigation)
            ->filter(fn ($entry) => is_array($entry))
            ->filter(fn (array $entry) => ($entry['type'] ?? null) === 'heading')
            ->map(function (array $entry): ?array {
                $id = trim((string) ($entry['html_id'] ?? ''));
                $title = trim((string) ($entry['text'] ?? ''));
                $level = is_numeric($entry['level'] ?? null)
                    ? max(1, min(6, (int) $entry['level']))
                    : null;

                if ($id === '' || $title === '') {
                    return null;
                }

                return [
                    'id' => $id,
                    'title' => $title,
                    'level' => $level,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, array{id: string, title: string}>  $noteTrail
     */
    private function buildBreadcrumbs(Note $note, array $noteTrail, mixed $noteById, Workspace $workspace): array
    {
        if ($note->type === Note::TYPE_JOURNAL) {
            if ($note->journal_granularity && $note->journal_date) {
                $date = $note->journal_date->locale($this->userLanguage());
                $yearPeriod = $this->journalNoteService->periodFor(Note::JOURNAL_YEARLY, $date);
                $monthPeriod = $this->journalNoteService->periodFor(Note::JOURNAL_MONTHLY, $date);
                $weekPeriod = $this->journalNoteService->periodFor(Note::JOURNAL_WEEKLY, $date);
                $dayPeriod = $this->journalNoteService->periodFor(Note::JOURNAL_DAILY, $date);

                $breadcrumbs = [[
                    'title' => 'Journal',
                    'href' => $this->noteSlugService->journalUrlFor($workspace, Note::JOURNAL_DAILY, $dayPeriod),
                ]];

                if (in_array($note->journal_granularity, [Note::JOURNAL_YEARLY, Note::JOURNAL_MONTHLY, Note::JOURNAL_WEEKLY, Note::JOURNAL_DAILY], true)) {
                    $breadcrumbs[] = [
                        'title' => $date->format('Y'),
                        'href' => $this->noteSlugService->journalUrlFor($workspace, Note::JOURNAL_YEARLY, $yearPeriod),
                    ];
                }

                if (in_array($note->journal_granularity, [Note::JOURNAL_MONTHLY, Note::JOURNAL_WEEKLY, Note::JOURNAL_DAILY], true)) {
                    $breadcrumbs[] = [
                        'title' => ucfirst($date->isoFormat('MMMM')),
                        'href' => $this->noteSlugService->journalUrlFor($workspace, Note::JOURNAL_MONTHLY, $monthPeriod),
                    ];
                }

                if (in_array($note->journal_granularity, [Note::JOURNAL_WEEKLY, Note::JOURNAL_DAILY], true)) {
                    $breadcrumbs[] = [
                        'title' => "Week {$date->isoWeek()}",
                        'href' => $this->noteSlugService->journalUrlFor($workspace, Note::JOURNAL_WEEKLY, $weekPeriod),
                    ];
                }

                if ($note->journal_granularity === Note::JOURNAL_DAILY) {
                    $breadcrumbs[] = [
                        'title' => $note->title ?? 'Untitled',
                        'href' => $this->noteSlugService->journalUrlFor($workspace, Note::JOURNAL_DAILY, $dayPeriod),
                    ];
                }

                return $breadcrumbs;
            }

            return [
                [
                    'title' => 'Journal',
                    'href' => $this->noteSlugService->journalUrlFor($workspace, Note::JOURNAL_DAILY, now()->toDateString()),
                ],
                [
                    'title' => $note->title ?? 'Untitled',
                    'href' => $this->noteSlugService->urlFor($note),
                ],
            ];
        }

        $rootNoteId = $noteTrail[0]['id'];
        $rootNote = $noteById->get($rootNoteId);

        $breadcrumbs = [
            [
                'title' => 'Notes',
                'href' => $rootNote
                    ? $this->noteSlugService->urlFor($rootNote)
                    : $this->noteSlugService->journalUrlFor($workspace, Note::JOURNAL_DAILY, now()->toDateString()),
            ],
        ];

        foreach ($noteTrail as $trailItem) {
            $trailNote = $noteById->get($trailItem['id']);
            $breadcrumbs[] = [
                'title' => $trailItem['title'],
                'href' => $trailNote ? $this->noteSlugService->urlFor($trailNote) : $this->noteSlugService->updateUrlFor($note),
            ];
        }

        return $breadcrumbs;
    }

    private function userLanguage(): string
    {
        $language = strtolower((string) data_get(Auth::user()?->settings, 'language', 'nl'));

        return in_array($language, ['nl', 'en'], true) ? $language : 'nl';
    }

    private function userLongDateFormat(): string
    {
        $language = $this->userLanguage();
        $value = strtolower((string) data_get(Auth::user()?->settings, 'date_long_format', ''));
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
     * @return array<int, string>
     */
    private function normalizeWorkspaceSuggestions(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->filter(fn ($item) => is_string($item))
            ->map(fn (string $item) => trim($item))
            ->filter(fn (string $item) => $item !== '')
            ->values()
            ->all();
    }

    private function replaceFirstHeadingLevelOneText(mixed $content, string $title): mixed
    {
        if (! is_array($content)) {
            return $content;
        }

        $replaced = false;
        $updated = $this->replaceHeadingNodeInTree($content, $title, $replaced);

        return $updated;
    }

    private function replaceHeadingNodeInTree(array $node, string $title, bool &$replaced): array
    {
        if ($replaced) {
            return $node;
        }

        $isHeadingOne =
            ($node['type'] ?? null) === 'heading'
            && (int) (($node['attrs']['level'] ?? 0)) === 1;

        if ($isHeadingOne) {
            $node['content'] = [[
                'type' => 'text',
                'text' => $title,
            ]];
            $replaced = true;

            return $node;
        }

        $children = $node['content'] ?? null;
        if (! is_array($children)) {
            return $node;
        }

        foreach ($children as $index => $child) {
            if (! is_array($child)) {
                continue;
            }

            $updatedChild = $this->replaceHeadingNodeInTree($child, $title, $replaced);
            $node['content'][$index] = $updatedChild;

            if ($replaced) {
                break;
            }
        }

        return $node;
    }

    private function resolveNoteOrFail(string $reference): Note
    {
        return $this->resolveNoteOrFailInWorkspace($this->currentWorkspace(), $reference);
    }

    private function resolveNoteOrFailInWorkspace(Workspace $workspace, string $reference): Note
    {
        $note = $this->noteSlugService->findByReference($workspace, $reference);

        if (! $note) {
            abort(404);
        }

        return $note;
    }

    /**
     * @return array{type:string,context:string,tags:string,tokens:string,q:string}
     */
    private function validateNotesListFilters(Request $request): array
    {
        $data = $request->validate([
            'type' => ['nullable', Rule::in(['all', Note::TYPE_NOTE, Note::TYPE_JOURNAL])],
            'context' => ['nullable', 'string', 'max:120'],
            'tags' => ['nullable', 'string', 'max:255'],
            'tokens' => ['nullable', 'string', 'max:255'],
            'q' => ['nullable', 'string', 'max:255'],
        ]);

        return [
            'type' => (string) ($data['type'] ?? Note::TYPE_NOTE),
            'context' => trim((string) ($data['context'] ?? '')),
            'tags' => trim((string) ($data['tags'] ?? '')),
            'tokens' => trim((string) ($data['tokens'] ?? '')),
            'q' => trim((string) ($data['q'] ?? '')),
        ];
    }

    /**
     * @param  array{type:string,context:string,tags:string,tokens:string,q:string}  $filters
     * @return array<int, array{
     *   id:string,
     *   title:string,
     *   href:string|null,
     *   icon:string|null,
     *   icon_color:string|null,
     *   icon_bg:string|null,
     *   type:string|null,
     *   context:string|null,
     *   tags:array<int,string>,
     *   path:string|null,
     *   has_children:bool,
     *   tasks_total:int,
     *   tasks_open:int,
     *   word_count:int|null,
     *   revision_count:int,
     *   created_at:string|null,
     *   updated_at:string|null,
     *   has_note:bool,
     *   is_virtual:bool
     * }>
     */
    private function buildNotesTreeLevel(string $workspaceId, ?string $parentId, array $filters): array
    {
        $workspaceSlug = (string) (Workspace::query()
            ->where('id', $workspaceId)
            ->value('slug') ?: 'workspace');

        $notes = Note::query()
            ->where('workspace_id', $workspaceId)
            ->when(
                $filters['type'] === Note::TYPE_NOTE,
                fn ($query) => $query->where(function ($inner) {
                    $inner->whereNull('type')->orWhere('type', Note::TYPE_NOTE);
                }),
            )
            ->when(
                $filters['type'] === Note::TYPE_JOURNAL,
                fn ($query) => $query->where('type', Note::TYPE_JOURNAL),
            )
            ->orderBy('created_at')
            ->get([
                'id',
                'workspace_id',
                'parent_id',
                'slug',
                'type',
                'journal_granularity',
                'journal_date',
                'title',
                'properties',
                'word_count',
                'created_at',
                'updated_at',
            ]);

        $byId = $notes->keyBy('id');

        $contextFilter = mb_strtolower($filters['context']);
        $queryFilter = mb_strtolower($filters['q']);
        $tagFilters = collect(explode(',', $filters['tags']))
            ->map(fn (string $item) => trim($item))
            ->filter(fn (string $item) => $item !== '')
            ->map(fn (string $item) => mb_strtolower(ltrim($item, '#')))
            ->values()
            ->all();
        $tokenFilters = collect(explode(',', $filters['tokens']))
            ->map(fn (string $item) => trim($item))
            ->filter(fn (string $item) => $item !== '')
            ->values()
            ->all();
        $tokenContextFilters = collect($tokenFilters)
            ->filter(fn (string $token) => str_starts_with($token, '@'))
            ->map(fn (string $token) => mb_strtolower(ltrim($token, '@')))
            ->filter(fn (string $token) => $token !== '')
            ->values()
            ->all();
        $tokenTagFilters = collect($tokenFilters)
            ->filter(fn (string $token) => str_starts_with($token, '#'))
            ->map(fn (string $token) => mb_strtolower(ltrim($token, '#')))
            ->filter(fn (string $token) => $token !== '')
            ->values()
            ->all();

        $hasContentFilters = $contextFilter !== '' || $queryFilter !== '' || $tagFilters !== [] || $tokenFilters !== [];
        $allowedIds = null;

        if ($hasContentFilters) {
            $matchedIds = [];

            foreach ($notes as $note) {
                $context = $note->context ?? '';
                $normalizedContext = mb_strtolower($context);
                $tags = $note->tags;
                $normalizedTags = array_map(
                    static fn (string $tag) => mb_strtolower($tag),
                    $tags,
                );

                if ($contextFilter !== '' && $normalizedContext !== $contextFilter) {
                    continue;
                }

                if ($tagFilters !== []) {
                    $containsAllTags = collect($tagFilters)
                        ->every(fn (string $needle) => in_array($needle, $normalizedTags, true));

                    if (! $containsAllTags) {
                        continue;
                    }
                }

                if ($tokenFilters !== []) {
                    $matchesContext = $tokenContextFilters !== [] && in_array($normalizedContext, $tokenContextFilters, true);
                    $matchesTag = $tokenTagFilters !== [] && collect($tokenTagFilters)
                        ->contains(fn (string $needle) => in_array($needle, $normalizedTags, true));

                    if (! $matchesContext && ! $matchesTag) {
                        continue;
                    }
                }

                if ($queryFilter !== '') {
                    $haystack = mb_strtolower(implode(' ', [
                        (string) ($note->title ?? ''),
                        (string) ($note->slug ?? ''),
                    ]));

                    if (! str_contains($haystack, $queryFilter)) {
                        continue;
                    }
                }

                $matchedIds[$note->id] = true;
            }

            $allowedIds = $matchedIds;

            foreach (array_keys($matchedIds) as $matchId) {
                $cursor = $byId->get($matchId);
                while ($cursor && $cursor->parent_id) {
                    $parent = $byId->get($cursor->parent_id);
                    if (! $parent) {
                        break;
                    }

                    $allowedIds[$parent->id] = true;
                    $cursor = $parent;
                }
            }
        }

        $isVisible = static function (Note $note) use ($allowedIds): bool {
            if ($allowedIds === null) {
                return true;
            }

            return isset($allowedIds[$note->id]);
        };

        $visibleNotes = $notes->filter($isVisible)->values();
        $visibleJournalNotes = $visibleNotes->filter(
            fn (Note $note) => $note->type === Note::TYPE_JOURNAL,
        )->values();
        $visibleNormalNotes = $visibleNotes->filter(
            fn (Note $note) => $note->type !== Note::TYPE_JOURNAL,
        )->values();

        $visibleChildCounts = [];
        foreach ($visibleNormalNotes as $note) {
            if (! $isVisible($note) || ! $note->parent_id) {
                continue;
            }

            $visibleChildCounts[$note->parent_id] = ($visibleChildCounts[$note->parent_id] ?? 0) + 1;
        }

        $levelNodes = $notes
            ->filter(function (Note $note) use ($parentId) {
                if ($parentId === null) {
                    return $note->parent_id === null;
                }

                return $note->parent_id === $parentId;
            })
            ->filter($isVisible)
            ->sort(function (Note $a, Note $b) use ($visibleChildCounts) {
                $aHasChildren = ($visibleChildCounts[$a->id] ?? 0) > 0;
                $bHasChildren = ($visibleChildCounts[$b->id] ?? 0) > 0;

                if ($aHasChildren !== $bHasChildren) {
                    return $aHasChildren ? -1 : 1;
                }

                return strcasecmp($a->title ?? 'Untitled', $b->title ?? 'Untitled');
            })
            ->values();

        $taskCounts = NoteTask::query()
            ->where('workspace_id', $workspaceId)
            ->selectRaw("note_id, COUNT(*) as total_count, SUM(CASE WHEN checked = 0 AND (task_status IS NULL OR task_status NOT IN ('canceled', 'migrated')) THEN 1 ELSE 0 END) as open_count")
            ->groupBy('note_id')
            ->get()
            ->keyBy('note_id');

        $revisionCounts = NoteRevision::query()
            ->join('notes', 'notes.id', '=', 'note_revisions.note_id')
            ->where('notes.workspace_id', $workspaceId)
            ->selectRaw('note_revisions.note_id, COUNT(*) as revision_count')
            ->groupBy('note_revisions.note_id')
            ->get()
            ->keyBy('note_id');

        $buildNotePayload = function (Note $note, bool $hasChildren) use ($taskCounts, $revisionCounts): array {
            $taskCountRow = $taskCounts->get($note->id);
            $revisionCountRow = $revisionCounts->get($note->id);

            return [
                'id' => $note->id,
                'title' => $note->display_title,
                'href' => $this->noteSlugService->urlFor($note),
                'icon' => $note->icon,
                'icon_color' => $note->icon_color,
                'icon_bg' => $note->icon_bg,
                'type' => $note->type,
                'context' => $note->context,
                'tags' => $note->tags,
                'path' => $note->path,
                'has_children' => $hasChildren,
                'tasks_total' => (int) ($taskCountRow?->total_count ?? 0),
                'tasks_open' => (int) ($taskCountRow?->open_count ?? 0),
                'word_count' => $note->word_count !== null ? (int) $note->word_count : null,
                'revision_count' => (int) ($revisionCountRow?->revision_count ?? 0),
                'created_at' => $note->created_at?->toIso8601String(),
                'updated_at' => $note->updated_at?->toIso8601String(),
                'has_note' => true,
                'is_virtual' => false,
            ];
        };

        $buildJournalVirtual = function (
            string $id,
            string $title,
            bool $hasChildren,
            string $fallbackHref,
            ?Note $backingNote = null,
        ) use ($buildNotePayload): array {
            if ($backingNote) {
                $payload = $buildNotePayload($backingNote, $hasChildren);
                $payload['id'] = $id;
                $payload['title'] = $title;
                $payload['has_children'] = $hasChildren;
                $payload['is_virtual'] = true;

                return $payload;
            }

            return [
                'id' => $id,
                'title' => $title,
                'href' => $fallbackHref,
                'icon' => null,
                'icon_color' => null,
                'icon_bg' => null,
                'type' => Note::TYPE_JOURNAL,
                'context' => null,
                'tags' => [],
                'path' => null,
                'has_children' => $hasChildren,
                'tasks_total' => 0,
                'tasks_open' => 0,
                'word_count' => null,
                'revision_count' => 0,
                'created_at' => null,
                'updated_at' => null,
                'has_note' => false,
                'is_virtual' => true,
            ];
        };

        $buildJournalLevel = function (string $levelParentId) use (
            $visibleJournalNotes,
            $buildJournalVirtual,
            $buildNotePayload,
            $workspaceSlug,
        ): array {
            if ($levelParentId === 'journal') {
                $years = $visibleJournalNotes
                    ->filter(fn (Note $note) => $note->journal_date !== null)
                    ->map(fn (Note $note) => $note->journal_date->format('Y'))
                    ->unique()
                    ->sort()
                    ->values();

                return $years->map(function (string $year) use ($visibleJournalNotes, $buildJournalVirtual, $workspaceSlug) {
                    $yearNotes = $visibleJournalNotes->filter(
                        fn (Note $note) => $note->journal_date?->format('Y') === $year,
                    );
                    $backing = $yearNotes->first(
                        fn (Note $note) => $note->journal_granularity === Note::JOURNAL_YEARLY,
                    );
                    $hasChildren = $yearNotes->contains(
                        fn (Note $note) => in_array($note->journal_granularity, [
                            Note::JOURNAL_MONTHLY,
                            Note::JOURNAL_WEEKLY,
                            Note::JOURNAL_DAILY,
                        ], true),
                    );

                    return $buildJournalVirtual(
                        "journal:year:{$year}",
                        $year,
                        $hasChildren,
                        $this->noteSlugService->journalUrlFor($workspaceSlug, Note::JOURNAL_YEARLY, $year),
                        $backing,
                    );
                })->all();
            }

            if (preg_match('/^journal:year:(\d{4})$/', $levelParentId, $matches) === 1) {
                $year = $matches[1];
                $yearNotes = $visibleJournalNotes->filter(
                    fn (Note $note) => $note->journal_date?->format('Y') === $year,
                );

                $months = $yearNotes
                    ->filter(
                        fn (Note $note) => in_array($note->journal_granularity, [
                            Note::JOURNAL_MONTHLY,
                            Note::JOURNAL_WEEKLY,
                            Note::JOURNAL_DAILY,
                        ], true),
                    )
                    ->map(fn (Note $note) => $note->journal_date->format('Y-m'))
                    ->unique()
                    ->sort()
                    ->values();

                return $months->map(function (string $month) use ($yearNotes, $buildJournalVirtual, $workspaceSlug) {
                    $monthNotes = $yearNotes->filter(
                        fn (Note $note) => $note->journal_date?->format('Y-m') === $month,
                    );
                    $backing = $monthNotes->first(
                        fn (Note $note) => $note->journal_granularity === Note::JOURNAL_MONTHLY,
                    );
                    $hasChildren = $monthNotes->contains(
                        fn (Note $note) => in_array($note->journal_granularity, [
                            Note::JOURNAL_WEEKLY,
                            Note::JOURNAL_DAILY,
                        ], true),
                    );
                    $title = ucfirst($monthNotes->first()?->journal_date?->locale($this->userLanguage())->isoFormat('MMMM YYYY') ?? $month);

                    return $buildJournalVirtual(
                        "journal:month:{$month}",
                        $title,
                        $hasChildren,
                        $this->noteSlugService->journalUrlFor($workspaceSlug, Note::JOURNAL_MONTHLY, $month),
                        $backing,
                    );
                })->all();
            }

            if (preg_match('/^journal:month:(\d{4}-\d{2})$/', $levelParentId, $matches) === 1) {
                $month = $matches[1];
                $monthNotes = $visibleJournalNotes->filter(
                    fn (Note $note) => $note->journal_date?->format('Y-m') === $month,
                );

                $weeks = $monthNotes
                    ->filter(
                        fn (Note $note) => in_array($note->journal_granularity, [
                            Note::JOURNAL_WEEKLY,
                            Note::JOURNAL_DAILY,
                        ], true),
                    )
                    ->map(fn (Note $note) => $this->journalNoteService->periodFor(Note::JOURNAL_WEEKLY, $note->journal_date))
                    ->unique()
                    ->sort()
                    ->values();

                return $weeks->map(function (string $weekPeriod) use ($monthNotes, $buildJournalVirtual, $workspaceSlug) {
                    [$weekYear, $weekNumRaw] = explode('-W', $weekPeriod);
                    $weekNum = ltrim($weekNumRaw, '0');
                    $weekNotes = $monthNotes->filter(
                        fn (Note $note) => $this->journalNoteService->periodFor(Note::JOURNAL_WEEKLY, $note->journal_date) === $weekPeriod,
                    );
                    $backing = $weekNotes->first(
                        fn (Note $note) => $note->journal_granularity === Note::JOURNAL_WEEKLY,
                    );
                    $hasChildren = $weekNotes->contains(
                        fn (Note $note) => $note->journal_granularity === Note::JOURNAL_DAILY,
                    );

                    return $buildJournalVirtual(
                        "journal:week:{$weekPeriod}",
                        "Week {$weekNum} {$weekYear}",
                        $hasChildren,
                        $this->noteSlugService->journalUrlFor($workspaceSlug, Note::JOURNAL_WEEKLY, $weekPeriod),
                        $backing,
                    );
                })->all();
            }

            if (preg_match('/^journal:week:(\d{4}-W\d{2})$/', $levelParentId, $matches) === 1) {
                $weekPeriod = $matches[1];

                return $visibleJournalNotes
                    ->filter(fn (Note $note) => $note->journal_granularity === Note::JOURNAL_DAILY)
                    ->filter(
                        fn (Note $note) => $this->journalNoteService->periodFor(Note::JOURNAL_WEEKLY, $note->journal_date) === $weekPeriod,
                    )
                    ->sortBy(fn (Note $note) => $note->journal_date?->toDateString())
                    ->map(fn (Note $note) => $buildNotePayload($note, false))
                    ->values()
                    ->all();
            }

            return [];
        };

        if ($parentId !== null && Str::startsWith($parentId, 'journal')) {
            return $buildJournalLevel($parentId);
        }

        $normalLevelNodes = $levelNodes
            ->filter(fn (Note $note) => $note->type !== Note::TYPE_JOURNAL)
            ->map(fn (Note $note) => $buildNotePayload(
                $note,
                ((int) ($visibleChildCounts[$note->id] ?? 0)) > 0,
            ))
            ->values()
            ->all();

        if ($parentId !== null) {
            return $normalLevelNodes;
        }

        $includeJournal = $filters['type'] !== Note::TYPE_NOTE;
        if (! $includeJournal || $visibleJournalNotes->isEmpty()) {
            return $normalLevelNodes;
        }

        $journalTopLevelNodes = $buildJournalLevel('journal');

        $combined = collect([...$normalLevelNodes, ...$journalTopLevelNodes])
            ->sort(function (array $a, array $b): int {
                if ($a['has_children'] !== $b['has_children']) {
                    return $a['has_children'] ? -1 : 1;
                }

                return strcasecmp((string) $a['title'], (string) $b['title']);
            })
            ->values()
            ->all();

        return $combined;
    }

    /**
     * @return array<int, string>
     */
    private function normalizePropertyTags(mixed $value): array
    {
        if (is_array($value)) {
            return collect($value)
                ->filter(fn ($item) => is_string($item))
                ->map(fn (string $item) => trim(ltrim($item, '#')))
                ->filter(fn (string $item) => $item !== '')
                ->values()
                ->all();
        }

        if (! is_string($value)) {
            return [];
        }

        return collect(explode(',', $value))
            ->map(fn (string $item) => trim(ltrim($item, '#')))
            ->filter(fn (string $item) => $item !== '')
            ->values()
            ->all();
    }

    private function currentWorkspace(): Workspace
    {
        $user = Auth::user();
        if (! $user) {
            abort(403, 'No workspace available.');
        }

        $routeWorkspace = request()->route('workspace');
        if ($routeWorkspace instanceof Workspace) {
            $isMember = $user->workspaces()
                ->where('workspaces.id', $routeWorkspace->id)
                ->exists();
            abort_unless($isMember, 403);

            return $routeWorkspace;
        }
        if (is_string($routeWorkspace) && trim($routeWorkspace) !== '') {
            $resolved = $user->workspaces()
                ->where('workspaces.slug', trim($routeWorkspace))
                ->first();
            abort_unless($resolved !== null, 403);

            return $resolved;
        }

        $workspace = $user->currentWorkspace();
        if (! $workspace) {
            abort(403, 'No workspace available.');
        }

        return $workspace;
    }

    private function assertWorkspaceMembership(Workspace $workspace): void
    {
        $user = Auth::user();
        if (! $user) {
            abort(403, 'No workspace available.');
        }

        $isMember = $user->workspaces()
            ->where('workspaces.id', $workspace->id)
            ->exists();

        abort_unless($isMember, 403);
    }

    private function normalizeContentForEditor(mixed $content): mixed
    {
        if (is_array($content)) {
            return $content;
        }

        if (! is_string($content) || trim($content) === '') {
            return $content;
        }

        $decoded = json_decode($content, true);

        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }

        return $content;
    }

    /**
     * @return array<string, string>|null
     */
    private function sanitizeProperties(mixed $value): ?array
    {
        if (! is_array($value)) {
            return null;
        }

        $properties = collect($value)
            ->filter(fn ($entry, $key) => is_string($key))
            ->mapWithKeys(function ($entry, $key) {
                if (is_string($entry)) {
                    return [$key => $entry];
                }

                if (is_scalar($entry)) {
                    return [$key => (string) $entry];
                }

                return [];
            })
            ->all();

        foreach (['icon-color' => 'text', 'icon-bg' => 'bg'] as $key => $prefix) {
            if (! array_key_exists($key, $properties)) {
                continue;
            }

            $token = trim(strtolower((string) $properties[$key]));
            $isValid = preg_match('/^(?:'.$prefix.')-(?:black|white|[a-z]+-(?:50|[1-9]00))$/', $token) === 1;

            if (! $isValid) {
                unset($properties[$key]);

                continue;
            }

            $properties[$key] = $token;
        }

        return $properties;
    }

    private function assertParentAssignmentIsValid(Note $note, ?string $parentId): void
    {
        if ($parentId === null) {
            return;
        }

        if ($parentId === $note->id) {
            throw ValidationException::withMessages([
                'parent_id' => 'A note cannot be its own parent.',
            ]);
        }

        $candidateParent = Note::query()
            ->where('workspace_id', $note->workspace_id)
            ->find($parentId);
        if (! $candidateParent) {
            return;
        }

        if ($this->isDescendant($candidateParent, $note->id)) {
            throw ValidationException::withMessages([
                'parent_id' => 'A note cannot be moved under its own descendant.',
            ]);
        }
    }

    private function isDescendant(Note $candidateParent, string $rootNoteId): bool
    {
        $cursor = $candidateParent;

        while ($cursor !== null) {
            if ($cursor->id === $rootNoteId) {
                return true;
            }

            if (! $cursor->parent_id) {
                return false;
            }

            $cursor = $cursor->parent;
        }

        return false;
    }
}
