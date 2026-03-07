<?php

namespace App\Support\Notes;

use App\Models\Note;
use App\Models\User;

class NoteRevisionRecorder
{
    public function record(Note $note, User $user, string $saveMode): void
    {
        if (! $this->shouldRecord($note, $user, $saveMode)) {
            return;
        }

        $note->revisions()->create([
            'user_id' => $user->id,
            'title' => $note->title,
            'content' => $note->content,
            'properties' => $note->properties,
        ]);
    }

    private function shouldRecord(Note $note, User $user, string $saveMode): bool
    {
        if ($saveMode === 'manual') {
            return true;
        }

        $latestRevision = $note->revisions()
            ->latest('created_at')
            ->first(['created_at']);

        if (! $latestRevision) {
            return true;
        }

        $intervalMinutes = $user->noteRevisionAutosaveIntervalMinutes();

        return $latestRevision->created_at->lte(now()->subMinutes($intervalMinutes));
    }
}
