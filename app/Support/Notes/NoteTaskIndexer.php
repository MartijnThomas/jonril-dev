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
        $currentHeading = null;
        $this->walkNodes(
            Arr::get($content, 'content', []),
            function (array $taskItem, ?string $sectionHeading) use ($note, &$rows, &$position): void {
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
                $taskStatus = $taskStatusFromAttrs ?? $this->extractTaskStatusFromText($text);

                if (
                    $backlogPromotedAt !== null &&
                    $taskStatusFromAttrs === null &&
                    $taskStatus === 'backlog'
                ) {
                    $taskStatus = null;
                }

                $rows[] = [
                    'workspace_id' => $note->workspace_id,
                    'note_id' => $note->id,
                    'block_id' => Arr::get($attrs, 'id'),
                    'section_heading' => $sectionHeading,
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
                    'due_date' => $this->normalizeIsoDateValue(Arr::get($attrs, 'dueDate')) ?? $fallbackDates['due_date'],
                    'deadline_date' => $this->normalizeIsoDateValue(Arr::get($attrs, 'deadlineDate')) ?? $fallbackDates['deadline_date'],
                    'due_date_token' => $fallbackDates['due_date_token'],
                    'deadline_date_token' => $fallbackDates['deadline_date_token'],
                    'journal_date' => $note->type === Note::TYPE_JOURNAL && $note->journal_granularity === Note::JOURNAL_DAILY
                        ? $note->journal_date
                        : null,
                    'mentions' => json_encode(array_values(array_unique($mentions))),
                    'hashtags' => json_encode(array_values(array_unique($hashtags))),
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            },
            $currentHeading,
        );

        if ($rows !== []) {
            NoteTask::query()->insert($rows);
        }
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  callable(array, ?string): void  $onTaskItem
     */
    private function walkNodes(array $nodes, callable $onTaskItem, ?string &$currentHeading = null): void
    {
        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            if ((string) ($node['type'] ?? '') === 'heading') {
                $headingText = $this->extractHeadingText($node);
                if ($headingText !== '') {
                    $currentHeading = $headingText;
                }
            }

            if ($this->isTaskNode($node)) {
                $onTaskItem($node, $currentHeading);
            }

            $children = Arr::get($node, 'content', []);
            if (is_array($children)) {
                $this->walkNodes($children, $onTaskItem, $currentHeading);
            }
        }
    }

    private function extractHeadingText(array $node): string
    {
        $parts = [];
        foreach (Arr::get($node, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            if ((string) ($child['type'] ?? '') === 'text') {
                $parts[] = (string) ($child['text'] ?? '');
            }
        }

        $text = trim(preg_replace('/\h+/u', ' ', implode('', $parts)) ?? '');
        // Strip leading markdown heading markers if present
        $text = (string) preg_replace('/^#{1,6}\s+/u', '', $text);

        return trim($text);
    }

    private function isTaskNode(array $node): bool
    {
        $type = (string) ($node['type'] ?? '');
        if ($type === 'taskItem') {
            return true;
        }

        if ($type !== 'paragraph') {
            return false;
        }

        return (string) Arr::get($node, 'attrs.blockStyle', '') === 'task';
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

            $dateFragments = $this->splitTaskDateTokens($text);

            $result = [];
            foreach ($dateFragments as $fragment) {
                if (($fragment['type'] ?? null) === 'text') {
                    $result = array_merge(
                        $result,
                        $this->splitInlineTokensFromText((string) ($fragment['text'] ?? ''), $mentions, $hashtags),
                    );
                } else {
                    $result[] = $fragment;
                }
            }

            return $result;
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
     * Split plain text into mention, hashtag, and text fragments.
     * Handles block-editor tasks where @mentions and #hashtags are stored as plain text.
     *
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @return array<int, array<string, mixed>>
     */
    private function splitInlineTokensFromText(string $text, array &$mentions, array &$hashtags): array
    {
        $pattern = '/(^|[^\p{L}\p{N}_\-])([@#][\p{L}\p{N}_\-]+)/u';

        if (! preg_match($pattern, $text)) {
            return $text !== '' ? [['type' => 'text', 'text' => $text]] : [];
        }

        $fragments = [];
        $cursor = 0;

        preg_match_all($pattern, $text, $allMatches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);

        foreach ($allMatches as $match) {
            $fullMatchOffset = (int) $match[0][1];
            $boundaryStr = (string) $match[1][0];
            $token = (string) $match[2][0];
            $tokenOffset = (int) $match[2][1];

            $before = substr($text, $cursor, $fullMatchOffset + strlen($boundaryStr) - $cursor);
            if ($before !== '') {
                $fragments[] = ['type' => 'text', 'text' => $before];
            }

            $label = substr($token, 1);

            if (str_starts_with($token, '@')) {
                $mentions[] = $label;
                $fragments[] = ['type' => 'mention', 'label' => $label];
            } else {
                $hashtags[] = $label;
                $fragments[] = ['type' => 'hashtag', 'label' => $label];
            }

            $cursor = $tokenOffset + strlen($token);
        }

        $remaining = substr($text, $cursor);
        if ($remaining !== '') {
            $fragments[] = ['type' => 'text', 'text' => $remaining];
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

        if (! preg_match('/(>>(?:\d{4}-\d{2}-\d{2}|\d{4}-[Ww]\d{1,2}|\d{4}-\d{1,2})|>(?:\d{4}-\d{2}-\d{2}|\d{4}-[Ww]\d{1,2}|\d{4}-\d{1,2}))/', $text)) {
            if ($text !== '') {
                $leadingFragments[] = [
                    'type' => 'text',
                    'text' => $text,
                ];
            }

            return $leadingFragments;
        }

        $parts = preg_split(
            '/(>>(?:\d{4}-\d{2}-\d{2}|\d{4}-[Ww]\d{1,2}|\d{4}-\d{1,2})|>(?:\d{4}-\d{2}-\d{2}|\d{4}-[Ww]\d{1,2}|\d{4}-\d{1,2}))/',
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

            if (preg_match('/^>>(.+)$/', $part, $matches)) {
                $tokenValue = trim((string) ($matches[1] ?? ''));
                $normalizedToken = $this->normalizeSupportedTaskDateToken($tokenValue);
                if ($normalizedToken === null) {
                    $fragments[] = [
                        'type' => 'text',
                        'text' => $part,
                    ];

                    continue;
                }

                $fragments[] = [
                    'type' => 'deadline_date_token',
                    'date' => $normalizedToken,
                ];

                continue;
            }

            if (preg_match('/^>(.+)$/', $part, $matches)) {
                $tokenValue = trim((string) ($matches[1] ?? ''));
                $normalizedToken = $this->normalizeSupportedTaskDateToken($tokenValue);
                if ($normalizedToken === null) {
                    $fragments[] = [
                        'type' => 'text',
                        'text' => $part,
                    ];

                    continue;
                }

                $fragments[] = [
                    'type' => 'due_date_token',
                    'date' => $normalizedToken,
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
     * @return array{
     *     due_date: string|null,
     *     deadline_date: string|null,
     *     due_date_token: string|null,
     *     deadline_date_token: string|null
     * }
     */
    private function extractDatesFromText(string $text): array
    {
        $result = [
            'due_date' => null,
            'deadline_date' => null,
            'due_date_token' => null,
            'deadline_date_token' => null,
        ];

        if (preg_match_all('/(^|\s)(>>|>)(\d{4}-\d{2}-\d{2}|\d{4}-[Ww]\d{1,2}|\d{4}-\d{1,2})(?=\s|$)/', $text, $matches, PREG_SET_ORDER)) {
            foreach ($matches as $match) {
                $prefix = $match[2] ?? null;
                $dateValue = trim((string) ($match[3] ?? ''));
                $normalizedToken = $this->normalizeSupportedTaskDateToken($dateValue);

                if ($normalizedToken === null) {
                    continue;
                }

                $isIsoDate = $this->isIsoDateToken($normalizedToken);
                if ($prefix === '>>') {
                    $result['deadline_date'] = $isIsoDate ? $normalizedToken : null;
                    $result['deadline_date_token'] = $isIsoDate ? null : $normalizedToken;
                } else {
                    $result['due_date'] = $isIsoDate ? $normalizedToken : null;
                    $result['due_date_token'] = $isIsoDate ? null : $normalizedToken;
                }
            }
        }

        return $result;
    }

    private function isSupportedTaskDateToken(string $value): bool
    {
        return $this->isIsoDateToken($value)
            || $this->isIsoWeekToken($value)
            || $this->isIsoMonthToken($value);
    }

    private function normalizeSupportedTaskDateToken(string $value): ?string
    {
        $normalized = trim($value);
        if ($normalized === '') {
            return null;
        }

        if ($this->isIsoDateToken($normalized)) {
            return $normalized;
        }

        if (preg_match('/^(?<year>\d{4})-[Ww](?<week>\d{1,2})$/', $normalized, $matches)) {
            $week = (int) ($matches['week'] ?? 0);
            if ($week < 1 || $week > 53) {
                return null;
            }

            return sprintf('%04d-W%02d', (int) $matches['year'], $week);
        }

        if (preg_match('/^(?<year>\d{4})-(?<month>\d{1,2})$/', $normalized, $matches)) {
            $month = (int) ($matches['month'] ?? 0);
            if ($month < 1 || $month > 12) {
                return null;
            }

            return sprintf('%04d-%02d', (int) $matches['year'], $month);
        }

        return null;
    }

    private function isIsoDateToken(string $value): bool
    {
        return (bool) preg_match('/^\d{4}-\d{2}-\d{2}$/', $value);
    }

    private function isIsoWeekToken(string $value): bool
    {
        if (! preg_match('/^(?<year>\d{4})-[Ww](?<week>\d{1,2})$/', $value, $matches)) {
            return false;
        }

        $week = (int) ($matches['week'] ?? 0);

        return $week >= 1 && $week <= 53;
    }

    private function isIsoMonthToken(string $value): bool
    {
        if (! preg_match('/^(?<year>\d{4})-(?<month>\d{1,2})$/', $value, $matches)) {
            return false;
        }

        $month = (int) ($matches['month'] ?? 0);

        return $month >= 1 && $month <= 12;
    }

    private function normalizeIsoDateValue(mixed $value): ?string
    {
        $normalized = trim((string) $value);
        if ($normalized === '' || ! $this->isIsoDateToken($normalized)) {
            return null;
        }

        return $normalized;
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
        return NoteTask::statusFromToken($token);
    }

    private function normalizeTaskStatus(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        return match (strtolower(trim($value))) {
            'canceled' => 'canceled',
            'assigned' => 'assigned',
            'deferred' => 'deferred',
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
