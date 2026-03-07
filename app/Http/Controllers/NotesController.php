<?php

namespace App\Http\Controllers;

use App\Models\Note;
use App\Support\Notes\NoteTitleExtractor;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class NotesController extends Controller
{
    public function __construct(
        private readonly NoteTitleExtractor $noteTitleExtractor
    ) {
    }

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

        // If no note is provided, create one and redirect to it.
        $note = Auth::user()->notes()->create([
            'parent_id' => $data['parent_id'] ?? null,
        ]);

        return to_route('notes.show', ['note' => $note->id]);
    }

    public function show(Note $note)
    {
        return Inertia::render('notes/show', [
            'content' => $this->normalizeContentForEditor($note->content),
            'noteId' => $note->id,
            'properties' => $note->properties ?? [],
        ]);
    }

    public function update(Request $request, Note $note)
    {
        $data = $request->validate([
            'content' => 'required',
            'properties' => 'nullable|array',
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
            $this->assertParentAssignmentIsValid($note, $data['parent_id']);
            $note->parent_id = $data['parent_id'];
        }

        $note->content = $data['content'];
        $note->properties = $data['properties'];
        $note->title = $this->noteTitleExtractor->extract($data['content']);
        $note->save();

        return Inertia::back();
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
