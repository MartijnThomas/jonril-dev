<?php

namespace App\Support\Notes;

use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class TimeblockIndexer
{
    public function reindexNote(
        Note $note,
        int $defaultDurationMinutes = 60,
        ?string $userTimezone = null,
    ): void
    {
        $resolvedTimezone = $this->resolveTimezone($userTimezone);

        DB::transaction(function () use ($note, $defaultDurationMinutes, $resolvedTimezone): void {
            $this->deleteNoteTimeblocks($note);

            if (
                $note->type !== Note::TYPE_JOURNAL
                || $note->journal_granularity !== Note::JOURNAL_DAILY
                || ! $note->journal_date
            ) {
                return;
            }

            $content = $this->normalizeContent($note->content);
            if (! $content) {
                return;
            }

            $timeblocks = [];
            $events = [];

            $this->walkNodes(
                Arr::get($content, 'content', []),
                function (array $node) use ($note, $defaultDurationMinutes, $resolvedTimezone, &$timeblocks, &$events): void {
                    $parsed = $this->parseTimeblockNode($node, $note, $defaultDurationMinutes, $resolvedTimezone);
                    if ($parsed === null) {
                        return;
                    }

                    $timeblockId = (string) str()->uuid();

                    $timeblocks[] = [
                        'id' => $timeblockId,
                        'location' => $parsed['location'],
                        'task_block_id' => $parsed['task_block_id'],
                        'task_checked' => $parsed['task_checked'],
                        'task_status' => $parsed['task_status'],
                        'meta' => $parsed['meta'],
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];

                    $events[] = [
                        'id' => (string) str()->uuid(),
                        'workspace_id' => $note->workspace_id,
                        'note_id' => $note->id,
                        'block_id' => $parsed['block_id'],
                        'eventable_type' => Timeblock::class,
                        'eventable_id' => $timeblockId,
                        'title' => $parsed['title'],
                        'starts_at' => $parsed['starts_at'],
                        'ends_at' => $parsed['ends_at'],
                        'timezone' => $parsed['timezone'],
                        'journal_date' => $parsed['journal_date'],
                        'meta' => json_encode([
                            'source' => 'editor',
                            'has_explicit_end' => $parsed['has_explicit_end'],
                        ]),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                },
            );

            if ($timeblocks === []) {
                return;
            }

            Timeblock::query()->insert($timeblocks);
            Event::query()->insert($events);
        });
    }

    public function deleteNoteTimeblocks(Note $note): void
    {
        $eventQuery = Event::query()
            ->where('note_id', $note->id)
            ->where('eventable_type', Timeblock::class);

        $timeblockIds = (clone $eventQuery)
            ->pluck('eventable_id')
            ->filter(fn (mixed $id): bool => is_string($id) && $id !== '')
            ->values()
            ->all();

        $eventQuery->delete();

        if ($timeblockIds !== []) {
            Timeblock::query()->whereIn('id', $timeblockIds)->delete();
        }
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  callable(array): void  $onNode
     */
    private function walkNodes(array $nodes, callable $onNode): void
    {
        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            $type = (string) ($node['type'] ?? '');
            if (in_array($type, ['listItem', 'taskItem'], true)) {
                $onNode($node);
            }

            $children = Arr::get($node, 'content', []);
            if (is_array($children)) {
                $this->walkNodes($children, $onNode);
            }
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parseTimeblockNode(
        array $node,
        Note $note,
        int $defaultDurationMinutes,
        string $timezone,
    ): ?array
    {
        $fragments = $this->nodeInlineFragments($node);
        if ($fragments === []) {
            return null;
        }

        $line = trim($this->fragmentsToText($fragments));
        if ($line === '') {
            return null;
        }

        if (! preg_match(
            '/^(?<start>[01]?\d|2[0-3]):(?<start_min>[0-5]\d)(?:\s*-\s*(?<end>[01]?\d|2[0-3]):(?<end_min>[0-5]\d))?\s+(?<rest>.+)$/u',
            $line,
            $matches,
        )) {
            return null;
        }

        $journalDate = CarbonImmutable::createFromFormat(
            'Y-m-d',
            $note->journal_date->toDateString(),
            $timezone,
        )->startOfDay();
        $startHour = (int) $matches['start'];
        $startMinute = (int) $matches['start_min'];
        $startAtLocal = $journalDate->setTime($startHour, $startMinute);

        $hasExplicitEnd = isset($matches['end']) && $matches['end'] !== '';
        if ($hasExplicitEnd) {
            $endHour = (int) $matches['end'];
            $endMinute = (int) $matches['end_min'];
            $endAtLocal = $journalDate->setTime($endHour, $endMinute);

            if ($endAtLocal->lessThanOrEqualTo($startAtLocal)) {
                return null;
            }
        } else {
            $safeDuration = max(5, min(12 * 60, $defaultDurationMinutes));
            $endAtLocal = $startAtLocal->addMinutes($safeDuration);
        }

        $restText = trim((string) ($matches['rest'] ?? ''));
        if ($restText === '') {
            return null;
        }

        [$titleText, $locationText] = $this->splitTitleAndLocation($restText);
        $titleText = trim($titleText);

        if ($titleText === '') {
            return null;
        }

        $attrs = Arr::get($node, 'attrs', []);
        $blockId = Arr::get($attrs, 'id');
        $isTaskItem = (($node['type'] ?? null) === 'taskItem');

        $startAtUtc = $startAtLocal->timezone('UTC');
        $endAtUtc = $endAtLocal->timezone('UTC');

        return [
            'block_id' => $blockId,
            'title' => $titleText,
            'starts_at' => $startAtUtc,
            'ends_at' => $endAtUtc,
            'timezone' => $timezone,
            'location' => $locationText !== '' ? $locationText : null,
            'task_block_id' => $isTaskItem ? $blockId : null,
            'task_checked' => $isTaskItem ? (bool) Arr::get($attrs, 'checked', false) : null,
            'task_status' => $isTaskItem ? Arr::get($attrs, 'taskStatus') : null,
            'journal_date' => $journalDate->toDateString(),
            'meta' => null,
            'has_explicit_end' => $hasExplicitEnd,
        ];
    }

    private function resolveTimezone(?string $timezone): string
    {
        if (
            is_string($timezone)
            && $timezone !== ''
            && in_array($timezone, timezone_identifiers_list(), true)
        ) {
            return $timezone;
        }

        return config('app.timezone', 'UTC');
    }

    /**
     * @return array{0: string, 1: string}
     */
    private function splitTitleAndLocation(string $text): array
    {
        $parts = preg_split('/\s+@\s+/u', $text, 2);
        if (! is_array($parts)) {
            return [$text, ''];
        }

        $title = (string) ($parts[0] ?? '');
        $location = (string) ($parts[1] ?? '');

        return [$title, trim($location)];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function nodeInlineFragments(array $node): array
    {
        $fragments = [];

        foreach (Arr::get($node, 'content', []) as $child) {
            if (! is_array($child)) {
                continue;
            }

            if (($child['type'] ?? null) === 'taskList' || ($child['type'] ?? null) === 'bulletList' || ($child['type'] ?? null) === 'orderedList') {
                continue;
            }

            $fragments = array_merge($fragments, $this->inlineFragments($child));
        }

        return $fragments;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function inlineFragments(array $node): array
    {
        $type = $node['type'] ?? null;

        if ($type === 'text') {
            $text = (string) ($node['text'] ?? '');
            if ($text === '') {
                return [];
            }

            return [[
                'type' => 'text',
                'text' => $text,
            ]];
        }

        if ($type === 'hardBreak') {
            return [[
                'type' => 'text',
                'text' => ' ',
            ]];
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

            $fragments = array_merge($fragments, $this->inlineFragments($child));
        }

        return $fragments;
    }

    /**
     * @param  array<int, array<string, mixed>>  $fragments
     */
    private function fragmentsToText(array $fragments): string
    {
        $parts = [];
        foreach ($fragments as $fragment) {
            $parts[] = (string) ($fragment['text'] ?? '');
        }

        return trim(preg_replace('/\s+/u', ' ', implode('', $parts)) ?? '');
    }

    /**
     * @return array<string, mixed>|null
     */
    private function normalizeContent(mixed $content): ?array
    {
        if (is_array($content)) {
            return $content;
        }

        if (is_string($content) && $content !== '') {
            $decoded = json_decode($content, true);

            return is_array($decoded) ? $decoded : null;
        }

        return null;
    }
}
