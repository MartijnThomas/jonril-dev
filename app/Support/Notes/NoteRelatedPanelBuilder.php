<?php

namespace App\Support\Notes;

use App\Models\Note;
use App\Models\NoteTask;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class NoteRelatedPanelBuilder
{
    public function __construct(
        private readonly NoteSlugService $noteSlugService,
    ) {}

    /**
     * @return array{
     *   tasks: array<int, array<string, mixed>>,
     *   backlinks: array<int, array<string, mixed>>
     * }
     */
    public function build(Note $note): array
    {
        if ($note->type === Note::TYPE_JOURNAL && $note->journal_granularity === Note::JOURNAL_DAILY) {
            return [
                'tasks' => $this->tasksForDailyNote($note),
                'backlinks' => [],
            ];
        }

        if ($note->type === Note::TYPE_JOURNAL) {
            return [
                'tasks' => [],
                'backlinks' => [],
            ];
        }

        return [
            'tasks' => $this->relatedTasksForRegularNote($note),
            'backlinks' => $this->backlinksForRegularNote($note),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function tasksForDailyNote(Note $note): array
    {
        if (! $note->journal_date) {
            return [];
        }

        $targetDate = $note->journal_date->toDateString();
        $targetHref = $this->noteSlugService->urlFor($note);
        $contextMentions = $this->contextMentionsForNote($note);

        return NoteTask::query()
            ->where('workspace_id', $note->workspace_id)
            ->where('note_id', '!=', $note->id)
            ->with('note:id,workspace_id,slug,type,journal_granularity,journal_date,title')
            ->orderBy('checked')
            ->orderByRaw('case when due_date is null then 1 else 0 end')
            ->orderBy('due_date')
            ->orderByRaw('case when deadline_date is null then 1 else 0 end')
            ->orderBy('deadline_date')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->filter(function (NoteTask $task) use ($targetDate, $note, $targetHref, $contextMentions): bool {
                $matchesDate = $task->due_date?->toDateString() === $targetDate
                    || $task->deadline_date?->toDateString() === $targetDate;

                return $matchesDate
                    || $this->taskHasWikiLinkToNote($task, $note->id, $targetHref)
                    || $this->taskHasContextMention($task, $contextMentions);
            })
            ->map(fn (NoteTask $task) => $this->mapTaskForPanel($task))
            ->values()
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function relatedTasksForRegularNote(Note $note): array
    {
        $targetHref = $this->noteSlugService->urlFor($note);
        $contextMentions = $this->contextMentionsForNote($note);

        return NoteTask::query()
            ->where('workspace_id', $note->workspace_id)
            ->where('note_id', '!=', $note->id)
            ->with('note:id,workspace_id,slug,type,journal_granularity,journal_date,title')
            ->orderBy('checked')
            ->orderBy('updated_at', 'desc')
            ->get()
            ->filter(fn (NoteTask $task) => $this->taskHasWikiLinkToNote($task, $note->id, $targetHref)
                || $this->taskHasContextMention($task, $contextMentions))
            ->map(fn (NoteTask $task) => $this->mapTaskForPanel($task))
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function mapTaskForPanel(NoteTask $task): array
    {
        $taskNote = $task->note;

        return [
            'id' => $task->id,
            'note_id' => $task->note_id,
            'block_id' => $task->block_id,
            'position' => (int) $task->position,
            'checked' => (bool) $task->checked,
            'task_status' => $task->task_status,
            'backlog_promoted_at' => $task->backlog_promoted_at?->toIso8601String(),
            'priority' => $task->priority,
            'content' => $task->content_text ?? '',
            'render_fragments' => is_array($task->render_fragments) ? $task->render_fragments : [],
            'due_date' => $task->due_date?->toDateString(),
            'deadline_date' => $task->deadline_date?->toDateString(),
            'note' => [
                'id' => $task->note_id,
                'title' => $task->note_title ?? 'Untitled',
                'href' => $taskNote ? $this->noteSlugService->urlFor($taskNote) : null,
            ],
        ];
    }

    private function taskHasWikiLinkToNote(NoteTask $task, string $targetNoteId, string $targetHref): bool
    {
        $fragments = is_array($task->render_fragments) ? $task->render_fragments : [];

        foreach ($fragments as $fragment) {
            if (! is_array($fragment) || ($fragment['type'] ?? null) !== 'wikilink') {
                continue;
            }

            $noteId = trim((string) ($fragment['note_id'] ?? ''));
            if ($noteId !== '' && $noteId === $targetNoteId) {
                return true;
            }

            $href = trim((string) ($fragment['href'] ?? ''));
            if ($href !== '' && $href === $targetHref) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, string>
     */
    private function contextMentionsForNote(Note $note): array
    {
        $rawContext = trim((string) ($note->context ?? ''));
        if ($rawContext === '') {
            return [];
        }

        $parts = preg_split('/[\s,]+/u', $rawContext);
        if (! is_array($parts)) {
            return [];
        }

        return collect($parts)
            ->map(fn (string $part) => ltrim(trim($part), '@'))
            ->filter(fn (string $part) => $part !== '')
            ->map(fn (string $part) => mb_strtolower($part))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  array<int, string>  $contextMentions
     */
    private function taskHasContextMention(NoteTask $task, array $contextMentions): bool
    {
        if ($contextMentions === []) {
            return false;
        }

        $taskMentions = is_array($task->mentions) ? $task->mentions : [];
        if ($taskMentions === []) {
            return false;
        }

        $contextLookup = array_fill_keys($contextMentions, true);

        foreach ($taskMentions as $mention) {
            $normalized = mb_strtolower(trim((string) $mention));
            if ($normalized !== '' && isset($contextLookup[$normalized])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function backlinksForRegularNote(Note $note): array
    {
        $targetHref = $this->noteSlugService->urlFor($note);
        $sourceNotes = Note::query()
            ->where('workspace_id', $note->workspace_id)
            ->where('id', '!=', $note->id)
            ->whereNotNull('content')
            ->orderByDesc('updated_at')
            ->get(['id', 'workspace_id', 'title', 'slug', 'type', 'journal_granularity', 'journal_date', 'content']);

        $rows = [];
        foreach ($sourceNotes as $sourceNote) {
            $content = $this->normalizeContentForEditor($sourceNote->content);
            if (! is_array($content)) {
                continue;
            }

            $matches = $this->extractBacklinkBlocksFromContent(
                $content,
                $sourceNote,
                $note->id,
                $targetHref,
            );

            foreach ($matches as $match) {
                $rows[] = $match;
            }
        }

        return array_values($rows);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function extractBacklinkBlocksFromContent(
        array $content,
        Note $sourceNote,
        string $targetNoteId,
        string $targetHref,
    ): array {
        $blocks = Arr::get($content, 'content', []);
        if (! is_array($blocks)) {
            return [];
        }

        $results = [];
        $seenBlockIds = [];
        $sourceHref = $this->noteSlugService->urlFor($sourceNote);

        $walk = function (array $nodes, bool $insideTaskItem = false) use (
            &$walk,
            &$results,
            &$seenBlockIds,
            $sourceNote,
            $sourceHref,
            $targetNoteId,
            $targetHref,
        ): void {
            foreach ($nodes as $node) {
                if (! is_array($node)) {
                    continue;
                }

                $type = (string) ($node['type'] ?? '');
                $blockId = trim((string) Arr::get($node, 'attrs.id', ''));
                $isCandidateType = in_array($type, ['heading', 'paragraph', 'blockquote'], true);
                $shouldSkipAsDuplicateTaskParagraph = $insideTaskItem && $type === 'paragraph';

                if (
                    $blockId !== ''
                    && $isCandidateType
                    && ! $shouldSkipAsDuplicateTaskParagraph
                    && ! isset($seenBlockIds[$blockId])
                    && $this->nodeContainsWikiLinkTo($node, $targetNoteId, $targetHref)
                ) {
                    $rawFragments = $this->collectInlineRenderFragments($node);
                    $truncatedFragments = $this->truncateRenderFragments($rawFragments, 180);
                    $excerpt = trim(preg_replace('/\s+/u', ' ', $this->renderFragmentsToText($truncatedFragments)) ?? '');
                    if ($excerpt !== '') {
                        $seenBlockIds[$blockId] = true;
                        $results[] = [
                            'id' => "{$sourceNote->id}:{$blockId}",
                            'block_id' => $blockId,
                            'excerpt' => Str::limit($excerpt, 180),
                            'render_fragments' => $truncatedFragments,
                            'note' => [
                                'id' => $sourceNote->id,
                                'title' => $sourceNote->title ?? 'Untitled',
                                'href' => $sourceHref,
                            ],
                            'href' => "{$sourceHref}#{$blockId}",
                        ];
                    }
                }

                $children = Arr::get($node, 'content', []);
                if (! is_array($children) || $children === []) {
                    continue;
                }

                $walk(
                    $children,
                    $insideTaskItem || $type === 'taskItem',
                );
            }
        };

        $walk($blocks);

        return $results;
    }

    private function nodeContainsWikiLinkTo(array $node, string $targetNoteId, string $targetHref): bool
    {
        if (($node['type'] ?? null) === 'text') {
            $marks = Arr::get($node, 'marks', []);
            if (is_array($marks)) {
                foreach ($marks as $mark) {
                    if (! is_array($mark) || (($mark['type'] ?? null) !== 'wikiLink')) {
                        continue;
                    }

                    $noteId = trim((string) Arr::get($mark, 'attrs.noteId', ''));
                    if ($noteId !== '' && $noteId === $targetNoteId) {
                        return true;
                    }

                    $href = trim((string) Arr::get($mark, 'attrs.href', ''));
                    if ($href !== '' && $href === $targetHref) {
                        return true;
                    }
                }
            }
        }

        $children = Arr::get($node, 'content', []);
        if (! is_array($children)) {
            return false;
        }

        foreach ($children as $child) {
            if (is_array($child) && $this->nodeContainsWikiLinkTo($child, $targetNoteId, $targetHref)) {
                return true;
            }
        }

        return false;
    }

    private function collectNodeReadableText(array $node): string
    {
        $type = (string) ($node['type'] ?? '');

        if ($type === 'text') {
            return (string) ($node['text'] ?? '');
        }

        if ($type === 'mention') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));

            return $label !== '' ? "@{$label}" : '';
        }

        if ($type === 'hashtag') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));

            return $label !== '' ? "#{$label}" : '';
        }

        $children = Arr::get($node, 'content', []);
        if (! is_array($children) || $children === []) {
            return '';
        }

        $text = '';
        foreach ($children as $child) {
            if (! is_array($child)) {
                continue;
            }

            $text .= $this->collectNodeReadableText($child);
        }

        return $text;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function collectInlineRenderFragments(array $node): array
    {
        $type = (string) ($node['type'] ?? '');

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

            return $this->splitRenderDateTokens($text);
        }

        if ($type === 'mention') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));
            if ($label === '') {
                return [];
            }

            return [[
                'type' => 'mention',
                'label' => $label,
            ]];
        }

        if ($type === 'hashtag') {
            $label = trim((string) Arr::get($node, 'attrs.label', Arr::get($node, 'attrs.id', '')));
            if ($label === '') {
                return [];
            }

            return [[
                'type' => 'hashtag',
                'label' => $label,
            ]];
        }

        if ($type === 'hardBreak') {
            return [[
                'type' => 'text',
                'text' => ' ',
            ]];
        }

        $children = Arr::get($node, 'content', []);
        if (! is_array($children) || $children === []) {
            return [];
        }

        $fragments = [];
        foreach ($children as $child) {
            if (! is_array($child)) {
                continue;
            }

            $fragments = array_merge($fragments, $this->collectInlineRenderFragments($child));
        }

        return $fragments;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function splitRenderDateTokens(string $text): array
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
     * @param  array<int, array<string, mixed>>  $fragments
     * @return array<int, array<string, mixed>>
     */
    private function truncateRenderFragments(array $fragments, int $maxChars): array
    {
        $remaining = max(0, $maxChars);
        if ($remaining === 0) {
            return [];
        }

        $result = [];
        foreach ($fragments as $fragment) {
            $type = (string) ($fragment['type'] ?? '');
            if ($type === '') {
                continue;
            }

            $segment = match ($type) {
                'text' => (string) ($fragment['text'] ?? ''),
                'mention' => '@'.trim((string) ($fragment['label'] ?? '')),
                'hashtag' => '#'.trim((string) ($fragment['label'] ?? '')),
                'wikilink' => (string) ($fragment['text'] ?? ''),
                'due_date_token' => '>'.trim((string) ($fragment['date'] ?? '')),
                'deadline_date_token' => '>>'.trim((string) ($fragment['date'] ?? '')),
                default => '',
            };

            if ($segment === '') {
                continue;
            }

            $segmentLength = mb_strlen($segment);
            if ($segmentLength <= $remaining) {
                $result[] = $fragment;
                $remaining -= $segmentLength;
                if ($remaining <= 0) {
                    break;
                }

                continue;
            }

            if ($type === 'text') {
                $trimmed = trim(Str::limit((string) ($fragment['text'] ?? ''), $remaining + 1, '…'));
                if ($trimmed !== '') {
                    $result[] = [
                        'type' => 'text',
                        'text' => $trimmed,
                    ];
                }
            } else {
                $result[] = [
                    'type' => 'text',
                    'text' => '…',
                ];
            }

            break;
        }

        return $result;
    }

    /**
     * @param  array<int, array<string, mixed>>  $fragments
     */
    private function renderFragmentsToText(array $fragments): string
    {
        $parts = [];
        foreach ($fragments as $fragment) {
            $type = (string) ($fragment['type'] ?? '');

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

        return trim(implode('', $parts));
    }

    /**
     * @return array<string, mixed>|string|null
     */
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
}
