<?php

namespace App\Support\Notes;

use App\Models\Note;
use App\Models\NoteTask;
use App\Models\Workspace;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;
use Throwable;

class NoteTaskIndexer
{
    /**
     * @var array<int, string>
     */
    private const NESTED_LIST_TYPES = ['taskList', 'bulletList', 'orderedList', 'checkList'];

    public function reindexWorkspace(Workspace $workspace): void
    {
        $notes = $workspace->notes()->get([
            'id',
            'workspace_id',
            'title',
            'parent_id',
            'type',
            'journal_granularity',
            'journal_date',
            'content',
        ]);

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
                $children = $this->taskChildren($taskItem);
                $text = $this->fragmentsToText($fragments);
                $fallbackDates = $this->extractDatesFromText($text);

                $attrs = Arr::get($taskItem, 'attrs', []);
                $priorityFromAttrs = $this->normalizePriority(
                    Arr::get($attrs, 'priority'),
                );
                $taskStatusFromAttrs = $this->normalizeTaskStatus(
                    Arr::get($attrs, 'taskStatus'),
                );
                $backlogPromotedAt = $this->normalizeTimestampValue(
                    Arr::get($attrs, 'backlogPromotedAt'),
                );
                $completedAt = $this->normalizeTimestampValue(
                    Arr::get($attrs, 'completedAt'),
                );
                $startedAt = $this->normalizeTimestampValue(
                    Arr::get($attrs, 'startedAt'),
                );
                $canceledAt = $this->normalizeTimestampValue(
                    Arr::get($attrs, 'canceledAt'),
                );
                $migratedToNoteId = $this->normalizeUuidValue(
                    Arr::get($attrs, 'migratedToNoteId'),
                );
                $migratedFromNoteId = $this->normalizeUuidValue(
                    Arr::get($attrs, 'migratedFromNoteId'),
                );
                $taskStatus = $backlogPromotedAt !== null
                    ? null
                    : ($taskStatusFromAttrs ?? $this->extractTaskStatusFromText($text));

                $rows[] = [
                    'workspace_id' => $note->workspace_id,
                    'note_id' => $note->id,
                    'block_id' => Arr::get($attrs, 'id'),
                    'note_title' => $note->title,
                    'parent_note_id' => $note->parent_id,
                    'parent_note_title' => $note->parent?->title,
                    'position' => $position,
                    'checked' => (bool) Arr::get($attrs, 'checked', false),
                    'task_status' => $taskStatus,
                    'canceled_at' => $canceledAt,
                    'completed_at' => $completedAt,
                    'started_at' => $startedAt,
                    'backlog_promoted_at' => $backlogPromotedAt,
                    'migrated_to_note_id' => $migratedToNoteId,
                    'migrated_from_note_id' => $migratedFromNoteId,
                    'priority' => $priorityFromAttrs ?? $this->extractPriorityFromText($text),
                    'content_text' => $text,
                    'render_fragments' => json_encode($fragments),
                    'children' => json_encode($children),
                    'due_date' => Arr::get($attrs, 'dueDate') ?? $fallbackDates['due_date'],
                    'deadline_date' => Arr::get($attrs, 'deadlineDate') ?? $fallbackDates['deadline_date'],
                    'journal_date' => $note->type === Note::TYPE_JOURNAL && $note->journal_granularity === Note::JOURNAL_DAILY
                        ? $note->journal_date
                        : null,
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
        $fragments = $this->lineFragments($taskItem, $mentions, $hashtags);

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
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @return array<int, array<string, mixed>>
     */
    private function lineFragments(array $node, array &$mentions, array &$hashtags): array
    {
        $fragments = [];

        foreach (Arr::get($node, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            if (in_array((string) ($child['type'] ?? ''), self::NESTED_LIST_TYPES, true)) {
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
    private function taskChildren(array $taskItem): array
    {
        $children = [];

        foreach (Arr::get($taskItem, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            if (! in_array((string) ($child['type'] ?? ''), self::NESTED_LIST_TYPES, true)) {
                continue;
            }

            $children = [
                ...$children,
                ...$this->listChildren($child),
            ];
        }

        return $children;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function listChildren(array $listNode): array
    {
        $listType = (string) ($listNode['type'] ?? '');
        $children = [];

        foreach (Arr::get($listNode, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            $itemType = (string) ($child['type'] ?? '');
            if (! in_array($itemType, ['taskItem', 'listItem', 'checkItem'], true)) {
                continue;
            }

            $children[] = $this->childItemPayload($child, $listType);
        }

        return $children;
    }

    /**
     * @return array<string, mixed>
     */
    private function childItemPayload(array $itemNode, string $listType): array
    {
        $mentions = [];
        $hashtags = [];
        $fragments = $this->taskFragments($itemNode, $mentions, $hashtags);
        $text = $this->fragmentsToText($fragments);
        $fallbackDates = $this->extractDatesFromText($text);

        $nestedChildren = [];
        foreach (Arr::get($itemNode, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            if (! in_array((string) ($child['type'] ?? ''), self::NESTED_LIST_TYPES, true)) {
                continue;
            }

            $nestedChildren = [
                ...$nestedChildren,
                ...$this->listChildren($child),
            ];
        }

        $attrs = Arr::get($itemNode, 'attrs', []);
        $itemType = (string) ($itemNode['type'] ?? '');

        return [
            'type' => $itemType,
            'list_type' => $listType,
            'block_id' => Arr::get($attrs, 'id'),
            'checked' => in_array($itemType, ['taskItem', 'checkItem'], true)
                ? (bool) Arr::get($attrs, 'checked', false)
                : null,
            'content_text' => $text,
            'render_fragments' => $fragments,
            'mentions' => array_values(array_unique($mentions)),
            'hashtags' => array_values(array_unique($hashtags)),
            'due_date' => Arr::get($attrs, 'dueDate') ?? $fallbackDates['due_date'],
            'deadline_date' => Arr::get($attrs, 'deadlineDate') ?? $fallbackDates['deadline_date'],
            'children' => $nestedChildren,
        ];
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

                continue;
            }

            if ($type === 'priority_token') {
                $value = trim((string) ($fragment['value'] ?? ''));
                if ($value !== '') {
                    $parts[] = $value;
                }
                continue;
            }

            if ($type === 'status_token') {
                $value = trim((string) ($fragment['value'] ?? ''));
                if ($value !== '') {
                    $parts[] = $value;
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
        $leadingFragments = [];
        if (preg_match('/^(\s*)(—|<|\*|\?|\/)(?=\s|$)/u', $text, $statusMatch)) {
            $leading = (string) ($statusMatch[1] ?? '');
            $token = (string) ($statusMatch[2] ?? '');
            $taskStatus = $this->taskStatusFromToken($token);

            if ($leading !== '') {
                $leadingFragments[] = [
                    'type' => 'text',
                    'text' => $leading,
                ];
            }

            if ($taskStatus !== null) {
                $leadingFragments[] = [
                    'type' => 'status_token',
                    'value' => $token,
                    'status' => $taskStatus,
                ];
            }

            $consumedLength = strlen((string) ($statusMatch[0] ?? ''));
            $text = substr($text, $consumedLength) ?: '';
        }

        if (preg_match('/^(\s*)(!{1,3})(?=\s|$)/', $text, $priorityMatch)) {
            $leading = (string) ($priorityMatch[1] ?? '');
            $token = (string) ($priorityMatch[2] ?? '');

            if ($leading !== '') {
                $leadingFragments[] = [
                    'type' => 'text',
                    'text' => $leading,
                ];
            }

            $leadingFragments[] = [
                'type' => 'priority_token',
                'value' => $token,
                'priority' => $this->priorityFromToken($token),
            ];

            $consumedLength = strlen((string) ($priorityMatch[0] ?? ''));
            $text = substr($text, $consumedLength) ?: '';
        }

        if (! preg_match('/(>>\d{4}-\d{2}-\d{2}|>\d{4}-\d{2}-\d{2})/', $text)) {
            if ($text !== '') {
                $leadingFragments[] = [
                    'type' => 'text',
                    'text' => $text,
                ];
            }

            return $leadingFragments;
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

        return [...$leadingFragments, ...$fragments];
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

    private function extractPriorityFromText(string $text): ?string
    {
        if (! preg_match('/^\s*(?:—|<|\*|\?|\/)?\s*(!{1,3})(?=\s|$)/u', $text, $match)) {
            return null;
        }

        return $this->priorityFromToken((string) ($match[1] ?? ''));
    }

    private function extractTaskStatusFromText(string $text): ?string
    {
        if (! preg_match('/^\s*(—|<|\*|\?|\/)(?=\s|$)/u', $text, $match)) {
            return null;
        }

        return $this->taskStatusFromToken((string) ($match[1] ?? ''));
    }

    private function priorityFromToken(string $token): ?string
    {
        return match ($token) {
            '!!!' => 'high',
            '!!' => 'medium',
            '!' => 'normal',
            default => null,
        };
    }

    private function normalizePriority(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $normalized = strtolower(trim($value));

        return in_array($normalized, ['high', 'medium', 'normal'], true)
            ? $normalized
            : null;
    }

    private function taskStatusFromToken(string $token): ?string
    {
        return match ($token) {
            '—' => 'canceled',
            '<' => 'assigned',
            '/' => 'in_progress',
            '*' => 'starred',
            '?' => 'backlog',
            default => null,
        };
    }

    private function normalizeTaskStatus(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        return match (strtolower(trim($value))) {
            'canceled' => 'canceled',
            'assigned' => 'assigned',
            'in_progress' => 'in_progress',
            'migrated' => 'migrated',
            'starred' => 'starred',
            'backlog' => 'backlog',
            'question' => 'backlog',
            default => null,
        };
    }

    private function normalizeTimestampValue(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $normalized = trim($value);

        if ($normalized === '') {
            return null;
        }

        try {
            return Carbon::parse($normalized)->toDateTimeString();
        } catch (Throwable) {
            return null;
        }
    }

    private function normalizeUuidValue(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $normalized = trim($value);

        return $normalized !== '' ? $normalized : null;
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
