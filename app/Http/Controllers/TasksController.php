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

        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'note_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->where('user_id', $user->id)),
            ],
            'parent_id' => [
                'nullable',
                'uuid',
                Rule::exists('notes', 'id')->where(fn ($query) => $query->where('user_id', $user->id)),
            ],
            'mention' => ['nullable', 'string', 'max:120'],
            'hashtag' => ['nullable', 'string', 'max:120'],
            'due_from' => ['nullable', 'date'],
            'due_to' => ['nullable', 'date'],
            'deadline_from' => ['nullable', 'date'],
            'deadline_to' => ['nullable', 'date'],
            'show_completed' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in(['updated', 'due', 'deadline', 'note', 'position'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $query = NoteTask::query()
            ->where('user_id', $user->id)
            ->with('note:id,title,slug,type,journal_granularity,journal_date');

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

        if ($filters['note_id'] ?? null) {
            $query->where('note_id', $filters['note_id']);
        }

        if ($filters['parent_id'] ?? null) {
            $query->where('parent_note_id', $filters['parent_id']);
        }

        if ($filters['mention'] ?? null) {
            $mention = strtolower(trim((string) $filters['mention']));
            $query->whereRaw('LOWER(mentions) LIKE ?', ["%\"{$mention}\"%"]);
        }

        if ($filters['hashtag'] ?? null) {
            $hashtag = strtolower(trim((string) $filters['hashtag']));
            $query->whereRaw('LOWER(hashtags) LIKE ?', ["%\"{$hashtag}\"%"]);
        }

        if ($filters['due_from'] ?? null) {
            $query->whereDate('due_date', '>=', $filters['due_from']);
        }

        if ($filters['due_to'] ?? null) {
            $query->whereDate('due_date', '<=', $filters['due_to']);
        }

        if ($filters['deadline_from'] ?? null) {
            $query->whereDate('deadline_date', '>=', $filters['deadline_from']);
        }

        if ($filters['deadline_to'] ?? null) {
            $query->whereDate('deadline_date', '<=', $filters['deadline_to']);
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
                        'parent_id' => $task->parent_note_id,
                        'parent_title' => $task->parent_note_title,
                    ],
                    'updated_at' => $task->updated_at?->toIso8601String(),
                ];
            });

        $notes = Note::query()
            ->where('user_id', $user->id)
            ->where(function ($query) {
                $query->whereNull('type')->orWhere('type', '!=', Note::TYPE_JOURNAL);
            })
            ->orderBy('title')
            ->get(['id', 'title'])
            ->map(fn (Note $note) => [
                'id' => $note->id,
                'title' => $note->title ?? 'Untitled',
            ])
            ->values();

        return Inertia::render('tasks/index', [
            'tasks' => $tasks,
            'filters' => [
                'q' => $filters['q'] ?? '',
                'note_id' => $filters['note_id'] ?? '',
                'parent_id' => $filters['parent_id'] ?? '',
                'mention' => $filters['mention'] ?? '',
                'hashtag' => $filters['hashtag'] ?? '',
                'due_from' => $filters['due_from'] ?? '',
                'due_to' => $filters['due_to'] ?? '',
                'deadline_from' => $filters['deadline_from'] ?? '',
                'deadline_to' => $filters['deadline_to'] ?? '',
                'show_completed' => (bool) ($filters['show_completed'] ?? false),
                'sort' => $sort,
                'direction' => $direction,
            ],
            'notes' => $notes,
        ]);
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
}
