<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteRevisionRecorder;
use App\Support\Notes\NoteSlugService;
use App\Support\Notes\NoteTitleExtractor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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
    ) {}

    public function start(Request $request)
    {
        $data = $request->validate([
            'parent_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(
                    fn ($query) => $query->where('user_id', Auth::id()),
                ),
            ],
        ]);

        /** @var Note $note */
        $note = Auth::user()->notes()->create([
            'type' => Note::TYPE_NOTE,
            'parent_id' => $data['parent_id'] ?? null,
        ]);

        $this->noteSlugService->syncSingleNote($note);

        return redirect($this->noteSlugService->urlFor($note));
    }

    public function show(string $note)
    {
        $resolved = $this->resolveNoteOrFail($note);

        return $this->renderNotePage($resolved);
    }

    public function showJournal(Request $request, string $granularity, string $period)
    {
        try {
            $note = $this->journalNoteService->resolveOrCreate(
                $request->user(),
                $granularity,
                $period,
            );
        } catch (InvalidArgumentException) {
            abort(404);
        }

        return $this->renderNotePage($note);
    }

    public function update(Request $request, string $note)
    {
        $resolved = $this->resolveNoteOrFail($note);

        $data = $request->validate([
            'content' => 'required',
            'properties' => 'nullable|array',
            'save_mode' => ['sometimes', Rule::in(['auto', 'manual'])],
            'parent_id' => [
                'sometimes',
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(
                    fn ($query) => $query->where('user_id', Auth::id()),
                ),
            ],
        ]);

        if (array_key_exists('parent_id', $data)) {
            $this->assertParentAssignmentIsValid($resolved, $data['parent_id']);
            $resolved->parent_id = $data['parent_id'];
        }

        $resolved->content = $data['content'];
        $resolved->properties = $data['properties'];
        $resolved->title = $this->noteTitleExtractor->extract($data['content']);
        $resolved->save();

        if ($resolved->type === Note::TYPE_NOTE) {
            $this->noteSlugService->syncNoteAndDescendants($resolved);
        }

        $this->noteRevisionRecorder->record(
            note: $resolved,
            user: $request->user(),
            saveMode: $data['save_mode'] ?? 'auto',
        );

        return Inertia::back();
    }

    private function renderNotePage(Note $note)
    {
        if ($note->type === Note::TYPE_NOTE) {
            $this->noteSlugService->syncSingleNote($note);
        }

        $allNotes = Note::query()
            ->where('user_id', Auth::id())
            ->orderBy('created_at')
            ->get([
                'id',
                'slug',
                'title',
                'properties',
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
            ])
            ->values();

        $noteTrail = $buildTrail($note->id);
        if ($noteTrail === []) {
            $noteTrail = [[
                'id' => $note->id,
                'title' => $note->title ?? 'Untitled',
            ]];
        }

        $breadcrumbs = $this->buildBreadcrumbs($note, $noteTrail, $noteById);

        return Inertia::render('notes/show', [
            'content' => $this->normalizeContentForEditor($note->content),
            'noteId' => $note->id,
            'noteUrl' => $this->noteSlugService->urlFor($note),
            'noteUpdateUrl' => '/notes/'.($note->slug ?: $note->id),
            'noteType' => $note->type,
            'journalGranularity' => $note->journal_granularity,
            'journalPeriod' => ($note->type === Note::TYPE_JOURNAL && $note->journal_granularity && $note->journal_date)
                ? $this->journalNoteService->periodFor($note->journal_granularity, $note->journal_date)
                : null,
            'properties' => $note->properties ?? [],
            'linkableNotes' => $linkableNotes,
            'breadcrumbs' => $breadcrumbs,
        ]);
    }

    /**
     * @param  array<int, array{id: string, title: string}>  $noteTrail
     */
    private function buildBreadcrumbs(Note $note, array $noteTrail, mixed $noteById): array
    {
        if ($note->type === Note::TYPE_JOURNAL) {
            return [
                [
                    'title' => 'Journal',
                    'href' => '/journal/daily/'.now()->toDateString(),
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
                'href' => $rootNote ? $this->noteSlugService->urlFor($rootNote) : '/notes',
            ],
        ];

        foreach ($noteTrail as $trailItem) {
            $trailNote = $noteById->get($trailItem['id']);
            $breadcrumbs[] = [
                'title' => $trailItem['title'],
                'href' => $trailNote ? $this->noteSlugService->urlFor($trailNote) : "/notes/{$trailItem['id']}",
            ];
        }

        return $breadcrumbs;
    }

    private function resolveNoteOrFail(string $reference): Note
    {
        $note = $this->noteSlugService->findByReference(Auth::user(), $reference);

        if (! $note) {
            abort(404);
        }

        return $note;
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

        $candidateParent = Note::query()->find($parentId);
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
