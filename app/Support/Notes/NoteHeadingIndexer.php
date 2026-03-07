<?php

namespace App\Support\Notes;

use App\Models\Note;
use App\Models\NoteHeading;
use Illuminate\Support\Arr;

class NoteHeadingIndexer
{
    public function reindexNote(Note $note): void
    {
        NoteHeading::query()->where('note_id', $note->id)->delete();

        $content = $this->normalizeContent($note->content);
        if (! $content) {
            return;
        }

        $rows = [];
        $this->walkNodes(
            Arr::get($content, 'content', []),
            function (array $node) use ($note, &$rows): void {
                $attrs = Arr::get($node, 'attrs', []);
                $blockId = trim((string) ($attrs['id'] ?? ''));
                $text = trim($this->collectNodeText($node));

                if ($blockId === '' || $text === '') {
                    return;
                }

                $rows[] = [
                    'workspace_id' => $note->workspace_id,
                    'note_id' => $note->id,
                    'block_id' => $blockId,
                    'level' => is_numeric($attrs['level'] ?? null)
                        ? (int) $attrs['level']
                        : null,
                    'text' => $text,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            },
        );

        if ($rows !== []) {
            NoteHeading::query()->insert($rows);
        }
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  callable(array): void  $onHeading
     */
    private function walkNodes(array $nodes, callable $onHeading): void
    {
        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            if (($node['type'] ?? null) === 'heading') {
                $onHeading($node);
            }

            $children = Arr::get($node, 'content', []);
            if (is_array($children)) {
                $this->walkNodes($children, $onHeading);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $node
     */
    private function collectNodeText(array $node): string
    {
        $text = '';

        if (is_string($node['text'] ?? null)) {
            $text .= (string) $node['text'];
        }

        $children = is_array($node['content'] ?? null) ? $node['content'] : [];
        foreach ($children as $child) {
            if (! is_array($child)) {
                continue;
            }

            $text .= $this->collectNodeText($child);
        }

        return $text;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function normalizeContent(mixed $content): ?array
    {
        if (is_array($content)) {
            return $content;
        }

        if (! is_string($content) || trim($content) === '') {
            return null;
        }

        $decoded = json_decode($content, true);

        return is_array($decoded) ? $decoded : null;
    }
}
