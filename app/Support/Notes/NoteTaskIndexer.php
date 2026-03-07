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
                $fragments = $this->taskFragments($taskItem, $mentions, $hashtags);
                $text = $this->fragmentsToText($fragments);
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
                    'render_fragments' => json_encode($fragments),
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
    private function taskFragments(array $taskItem, array &$mentions, array &$hashtags): array
    {
        $fragments = [];

        foreach (Arr::get($taskItem, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            // Nested task lists are indexed as their own task items.
            if (($child['type'] ?? null) === 'taskList') {
                continue;
            }

            $fragments = array_merge(
                $fragments,
                $this->inlineFragments($child, $mentions, $hashtags),
            );
        }

        $normalized = [];
        foreach ($fragments as $fragment) {
            if (! is_array($fragment) || ! isset($fragment['type'])) {
                continue;
            }

            $type = $fragment['type'];
            if ($type === 'text') {
                $text = (string) ($fragment['text'] ?? '');
                if ($text === '') {
                    continue;
                }

                $lastIndex = count($normalized) - 1;
                if (
                    $lastIndex >= 0
                    && (($normalized[$lastIndex]['type'] ?? null) === 'text')
                ) {
                    $normalized[$lastIndex]['text'] =
                        (string) ($normalized[$lastIndex]['text'] ?? '').$text;
                    continue;
                }

                $normalized[] = [
                    'type' => 'text',
                    'text' => $text,
                ];
                continue;
            }

            $normalized[] = $fragment;
        }

        return $normalized;
    }

    /**
     * @param  array<int, array<string, mixed>>  $fragments
     */
    private function fragmentsToText(array $fragments): string
    {
        $parts = [];
        foreach ($fragments as $fragment) {
            $type = $fragment['type'] ?? null;
            if ($type === 'text') {
                $parts[] = (string) ($fragment['text'] ?? '');
                continue;
            }

            if ($type === 'mention') {
                $label = trim((string) ($fragment['label'] ?? ''));
                if ($label !== '') {
                    $parts[] = "@{$label}";
                }
                continue;
            }

            if ($type === 'hashtag') {
                $label = trim((string) ($fragment['label'] ?? ''));
                if ($label !== '') {
                    $parts[] = "#{$label}";
                }
                continue;
            }

            if ($type === 'wikilink') {
                $parts[] = (string) ($fragment['text'] ?? '');
                continue;
            }

            if ($type === 'due_date_token') {
                $date = trim((string) ($fragment['date'] ?? ''));
                if ($date !== '') {
                    $parts[] = ">{$date}";
                }
                continue;
            }

            if ($type === 'deadline_date_token') {
                $date = trim((string) ($fragment['date'] ?? ''));
                if ($date !== '') {
                    $parts[] = ">>{$date}";
                }
            }
        }

        $text = trim(preg_replace('/\s+/u', ' ', implode('', $parts)) ?? '');

        return $text;
    }

    /**
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     */
    private function inlineFragments(array $node, array &$mentions, array &$hashtags): array
    {
        $type = $node['type'] ?? null;

        if ($type === 'text') {
            $text = (string) ($node['text'] ?? '');
            if ($text === '') {
                return [];
            }

            $wikiLinkMark = collect(Arr::get($node, 'marks', []))
                ->first(fn ($mark) => is_array($mark) && (($mark['type'] ?? null) === 'wikiLink'));

            if (is_array($wikiLinkMark)) {
                return [[
                    'type' => 'wikilink',
                    'text' => $text,
                    'note_id' => Arr::get($wikiLinkMark, 'attrs.noteId'),
                    'href' => Arr::get($wikiLinkMark, 'attrs.href'),
                ]];
            }

            return $this->splitTaskDateTokens($text);
        }

        if ($type === 'hardBreak') {
            return [[
                'type' => 'text',
                'text' => ' ',
            ]];
        }

        if ($type === 'mention') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));
            if ($label !== '') {
                $mentions[] = $label;

                return [[
                    'type' => 'mention',
                    'label' => $label,
                ]];
            }

            return [];
        }

        if ($type === 'hashtag') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));
            if ($label !== '') {
                $hashtags[] = $label;

                return [[
                    'type' => 'hashtag',
                    'label' => $label,
                ]];
            }

            return [];
        }

        $content = Arr::get($node, 'content', []);
        if (! is_array($content)) {
            return [];
        }

        $fragments = [];
        foreach ($content as $child) {
            if (! is_array($child)) {
                continue;
            }

            $fragments = array_merge(
                $fragments,
                $this->inlineFragments($child, $mentions, $hashtags),
            );
        }

        return $fragments;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function splitTaskDateTokens(string $text): array
    {
        if (! preg_match('/(>>\d{4}-\d{2}-\d{2}|>\d{4}-\d{2}-\d{2})/', $text)) {
            return [[
                'type' => 'text',
                'text' => $text,
            ]];
        }

        $parts = preg_split(
            '/(>>\d{4}-\d{2}-\d{2}|>\d{4}-\d{2}-\d{2})/',
            $text,
            -1,
            PREG_SPLIT_DELIM_CAPTURE,
        );

        if (! is_array($parts)) {
            return [[
                'type' => 'text',
                'text' => $text,
            ]];
        }

        $fragments = [];
        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }

            if (preg_match('/^>>(\d{4}-\d{2}-\d{2})$/', $part, $matches)) {
                $fragments[] = [
                    'type' => 'deadline_date_token',
                    'date' => $matches[1],
                ];
                continue;
            }

            if (preg_match('/^>(\d{4}-\d{2}-\d{2})$/', $part, $matches)) {
                $fragments[] = [
                    'type' => 'due_date_token',
                    'date' => $matches[1],
                ];
                continue;
            }

            $fragments[] = [
                'type' => 'text',
                'text' => $part,
            ];
        }

        return $fragments;
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
