<?php

namespace App\Console\Commands\Notes;

use App\Models\Note;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class StripHeadingPrefixes extends Command
{
    protected $signature = 'notes:strip-heading-prefixes {--dry-run : Preview changes without saving}';

    protected $description = 'Strip markdown heading prefixes (# , ## , etc.) from heading node text content';

    public function handle(): int
    {
        $dryRun = $this->option('dry-run');

        if ($dryRun) {
            $this->info('Running in dry-run mode. No changes will be saved.');
        }

        $updated = 0;
        $skipped = 0;

        Note::query()
            ->whereNotNull('content')
            ->lazyById()
            ->each(function (Note $note) use ($dryRun, &$updated, &$skipped): void {
                $content = $note->content;

                if (! is_array($content)) {
                    $skipped++;

                    return;
                }

                $newContent = $this->stripPrefixesFromDoc($content);

                if ($newContent === $content) {
                    $skipped++;

                    return;
                }

                if (! $dryRun) {
                    DB::table('notes')
                        ->where('id', $note->id)
                        ->update(['content' => json_encode($newContent)]);
                }

                $updated++;
                $this->line("  Updated note: {$note->id} ({$note->title})");
            });

        $this->info("Done. Updated: {$updated}, Skipped: {$skipped}");

        return self::SUCCESS;
    }

    /**
     * @param  array<string, mixed>  $doc
     * @return array<string, mixed>
     */
    private function stripPrefixesFromDoc(array $doc): array
    {
        if (! isset($doc['content']) || ! is_array($doc['content'])) {
            return $doc;
        }

        $doc['content'] = array_map(fn (mixed $node) => $this->processNode($node), $doc['content']);

        return $doc;
    }

    private function processNode(mixed $node): mixed
    {
        if (! is_array($node) || ($node['type'] ?? null) !== 'heading') {
            return $node;
        }

        if (! isset($node['content']) || ! is_array($node['content'])) {
            return $node;
        }

        $firstChild = $node['content'][0] ?? null;

        if (
            ! is_array($firstChild) ||
            ($firstChild['type'] ?? null) !== 'text' ||
            ! isset($firstChild['text']) ||
            ! is_string($firstChild['text'])
        ) {
            return $node;
        }

        $stripped = preg_replace('/^#{1,6}\s/u', '', $firstChild['text']);

        if ($stripped === $firstChild['text']) {
            return $node;
        }

        $node['content'][0]['text'] = (string) $stripped;

        return $node;
    }
}
