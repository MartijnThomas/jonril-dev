<?php

namespace App\Support\Notes;

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\Workspace;
use Illuminate\Support\Arr;

class NoteTaskIndexer
{
    public function reindexWorkspace(Workspace $workspace): void
    {
        $notes = $workspace->notes()->get(['id', 'workspace_id', 'title', 'parent_id', 'content']);

        foreach ($notes as $note) {
            $this->reindexNote($note);
        }
    }

    public function reindexNote(Note $note): void
    {
        NoteTask::query()->where('note_id', $note->id)->delete();

        $content = $this->normalizeContent($note->content);
        if (! $content) {
            return;
        }

        $rows = [];
        $position = 0;
        $this->walkNodes(
            Arr::get($content, 'content', []),
            function (array $taskItem) use ($note, &$rows, &$position): void {
                $position++;

                $mentions = [];
                $hashtags = [];
                $text = $this->taskText($taskItem, $mentions, $hashtags);
                $fallbackDates = $this->extractDatesFromText($text);

                $attrs = Arr::get($taskItem, 'attrs', []);

                $rows[] = [
                    'workspace_id' => $note->workspace_id,
                    'note_id' => $note->id,
                    'block_id' => Arr::get($attrs, 'id'),
                    'note_title' => $note->title,
                    'parent_note_id' => $note->parent_id,
                    'parent_note_title' => $note->parent?->title,
                    'position' => $position,
                    'checked' => (bool) Arr::get($attrs, 'checked', false),
                    'content_text' => $text,
                    'due_date' => Arr::get($attrs, 'dueDate') ?? $fallbackDates['due_date'],
                    'deadline_date' => Arr::get($attrs, 'deadlineDate') ?? $fallbackDates['deadline_date'],
                    'mentions' => json_encode(array_values(array_unique($mentions))),
                    'hashtags' => json_encode(array_values(array_unique($hashtags))),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            },
        );

        if ($rows !== []) {
            NoteTask::query()->insert($rows);
        }
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  callable(array): void  $onTaskItem
     */
    private function walkNodes(array $nodes, callable $onTaskItem): void
    {
        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            if (($node['type'] ?? null) === 'taskItem') {
                $onTaskItem($node);
            }

            $children = Arr::get($node, 'content', []);
            if (is_array($children)) {
                $this->walkNodes($children, $onTaskItem);
            }
        }
    }

    /**
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     */
    private function taskText(array $taskItem, array &$mentions, array &$hashtags): string
    {
        $parts = [];

        foreach (Arr::get($taskItem, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            // Nested task lists are indexed as their own task items.
            if (($child['type'] ?? null) === 'taskList') {
                continue;
            }

            $parts[] = $this->inlineText($child, $mentions, $hashtags);
        }

        $text = trim(preg_replace('/\s+/u', ' ', implode(' ', $parts)) ?? '');

        return $text;
    }

    /**
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     */
    private function inlineText(array $node, array &$mentions, array &$hashtags): string
    {
        $type = $node['type'] ?? null;

        if ($type === 'text') {
            return (string) ($node['text'] ?? '');
        }

        if ($type === 'hardBreak') {
            return ' ';
        }

        if ($type === 'mention') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));
            if ($label !== '') {
                $mentions[] = $label;

                return "@{$label}";
            }

            return '';
        }

        if ($type === 'hashtag') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));
            if ($label !== '') {
                $hashtags[] = $label;

                return "#{$label}";
            }

            return '';
        }

        $content = Arr::get($node, 'content', []);
        if (! is_array($content)) {
            return '';
        }

        $parts = [];
        foreach ($content as $child) {
            if (! is_array($child)) {
                continue;
            }

            $parts[] = $this->inlineText($child, $mentions, $hashtags);
        }

        return implode(' ', $parts);
    }

    /**
     * @return array{due_date: string|null, deadline_date: string|null}
     */
    private function extractDatesFromText(string $text): array
    {
        $result = [
            'due_date' => null,
            'deadline_date' => null,
        ];

        if (preg_match_all('/(^|\s)(>>|>)(\d{4}-\d{2}-\d{2})(?=\s|$)/', $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $prefix = $match[2] ?? null;
                $date = $match[3] ?? null;

                if (! $date) {
                    continue;
                }

                if ($prefix === '>>') {
                    $result['deadline_date'] = $date;
                } else {
                    $result['due_date'] = $date;
                }
            }
        }

        return $result;
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
