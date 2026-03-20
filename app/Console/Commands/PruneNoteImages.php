<?php

namespace App\Console\Commands;

use App\Models\Note;
use App\Models\NoteImage;
use App\Models\NoteRevision;
use Carbon\CarbonInterface;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class PruneNoteImages extends Command
{
    protected $signature = 'notes:prune-images {--dry-run : Preview actions without writing changes}';

    protected $description = 'Mark note images orphaned only when neither note nor revisions reference them, then delete expired orphaned images';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $unattachedGraceHours = max(1, (int) config('note-images.unattached_grace_hours', 24));
        $orphanRetentionDays = max(1, (int) config('note-images.orphan_retention_days', 7));

        $orphaned = $this->markOrphanedImages($unattachedGraceHours, $dryRun);
        $deleted = $this->deleteExpiredOrphanedImages($orphanRetentionDays, $dryRun);

        $mode = $dryRun ? 'Dry run' : 'Done';
        $this->info("{$mode}: marked {$orphaned} image(s) orphaned, deleted {$deleted} image(s).");

        return self::SUCCESS;
    }

    private function markOrphanedImages(int $unattachedGraceHours, bool $dryRun): int
    {
        $count = 0;
        $threshold = now()->subHours($unattachedGraceHours);

        NoteImage::query()
            ->where('status', 'active')
            ->orderBy('id')
            ->chunk(200, function ($images) use (&$count, $dryRun, $threshold): void {
                /** @var \Illuminate\Support\Collection<int, NoteImage> $images */
                $noteIds = $images
                    ->pluck('note_id')
                    ->filter(fn ($value) => is_string($value) && $value !== '')
                    ->values()
                    ->all();

                $notes = Note::withTrashed()
                    ->whereIn('id', $noteIds)
                    ->get(['id', 'content', 'deleted_at'])
                    ->keyBy('id');
                $revisionsByNoteId = NoteRevision::query()
                    ->whereIn('note_id', $noteIds)
                    ->get(['note_id', 'content'])
                    ->groupBy('note_id');

                foreach ($images as $image) {
                    if (! $this->shouldMarkAsOrphaned($image, $notes, $revisionsByNoteId, $threshold)) {
                        continue;
                    }

                    $count += 1;
                    if ($dryRun) {
                        continue;
                    }

                    $image->forceFill([
                        'status' => 'orphaned',
                        'updated_at' => now(),
                    ])->save();
                }
            });

        return $count;
    }

    /**
     * @param  \Illuminate\Support\Collection<string, Note>  $notesById
     * @param  \Illuminate\Support\Collection<string, \Illuminate\Support\Collection<int, NoteRevision>>  $revisionsByNoteId
     */
    private function shouldMarkAsOrphaned(
        NoteImage $image,
        \Illuminate\Support\Collection $notesById,
        \Illuminate\Support\Collection $revisionsByNoteId,
        CarbonInterface $unattachedThreshold,
    ): bool {
        if ($image->note_id === null) {
            return $image->created_at !== null && $image->created_at->lte($unattachedThreshold);
        }

        $revisionReferencesImage = $this->revisionsReferenceImage(
            $revisionsByNoteId->get($image->note_id, collect()),
            $image->id,
        );

        $note = $notesById->get($image->note_id);
        if (! $note instanceof Note) {
            return ! $revisionReferencesImage;
        }

        if ($note->trashed()) {
            return ! $revisionReferencesImage;
        }

        if ($this->noteContentReferencesImage($note, $image->id)) {
            return false;
        }

        return ! $revisionReferencesImage;
    }

    private function noteContentReferencesImage(Note $note, string $imageId): bool
    {
        $content = $note->content;
        $contentText = is_string($content)
            ? $content
            : json_encode($content, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        if (! is_string($contentText) || trim($contentText) === '') {
            return false;
        }

        return str_contains($contentText, "/images/{$imageId}");
    }

    /**
     * @param  \Illuminate\Support\Collection<int, NoteRevision>  $revisions
     */
    private function revisionsReferenceImage(\Illuminate\Support\Collection $revisions, string $imageId): bool
    {
        foreach ($revisions as $revision) {
            $content = $revision->content;
            $contentText = is_string($content)
                ? $content
                : json_encode($content, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            if (! is_string($contentText) || trim($contentText) === '') {
                continue;
            }

            if (str_contains($contentText, "/images/{$imageId}")) {
                return true;
            }
        }

        return false;
    }

    private function deleteExpiredOrphanedImages(int $orphanRetentionDays, bool $dryRun): int
    {
        $count = 0;
        $threshold = now()->subDays($orphanRetentionDays);

        NoteImage::query()
            ->where('status', 'orphaned')
            ->where('updated_at', '<=', $threshold)
            ->orderBy('id')
            ->chunk(200, function ($images) use (&$count, $dryRun): void {
                /** @var \Illuminate\Support\Collection<int, NoteImage> $images */
                foreach ($images as $image) {
                    $count += 1;
                    if ($dryRun) {
                        continue;
                    }

                    if (Storage::disk($image->disk)->exists($image->path)) {
                        Storage::disk($image->disk)->delete($image->path);
                    }

                    $image->delete();
                }
            });

        return $count;
    }
}
