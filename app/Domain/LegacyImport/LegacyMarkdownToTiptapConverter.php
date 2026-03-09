<?php

namespace App\Domain\LegacyImport;

use Illuminate\Support\Arr;

class LegacyMarkdownToTiptapConverter
{
    /**
     * @param  array<int, array<string, mixed>>  $blocks
     * @param  array<string, array{id: string, href: string}>  $noteReferenceByLegacySlug
     * @return array{
     *   document: array<string, mixed>,
     *   mentions: array<int, string>,
     *   hashtags: array<int, string>,
     *   unresolved_wikilinks: array<int, string>
     * }
     */
    public function convert(
        string $markdown,
        array $blocks,
        array $noteReferenceByLegacySlug,
        bool $skipWiki = false,
    ): array {
        $mentions = [];
        $hashtags = [];
        $unresolvedWikiLinks = [];

        $topLevelBlocks = collect($blocks)
            ->filter(fn ($block) => is_array($block))
            ->filter(function (array $block): bool {
                $path = (string) ($block['path'] ?? '');

                return preg_match('/^b_\d+$/', $path) === 1;
            })
            ->sortBy(function (array $block): int {
                $path = (string) ($block['path'] ?? 'b_0');

                return (int) str_replace('b_', '', $path);
            })
            ->values()
            ->all();

        $taskByPath = collect($blocks)
            ->filter(fn ($block) => is_array($block))
            ->filter(fn (array $block) => ($block['type'] ?? null) === 'task_item')
            ->mapWithKeys(function (array $block): array {
                $path = (string) ($block['path'] ?? '');
                if ($path === '') {
                    return [];
                }

                return [$path => $block];
            })
            ->all();

        $content = [];

        foreach ($topLevelBlocks as $block) {
            $type = (string) ($block['type'] ?? '');
            $blockPath = (string) ($block['path'] ?? '');
            $blockMarkdown = (string) ($block['markdown'] ?? '');
            $meta = $this->decodeJsonField($block['meta'] ?? null);

            if ($type === 'heading') {
                $level = (int) (Arr::get($meta, 'level', 1));
                $headingText = trim((string) preg_replace('/^\s*#{1,6}\s*/', '', $blockMarkdown));
                $content[] = [
                    'type' => 'heading',
                    'attrs' => [
                        'level' => max(1, min(6, $level)),
                    ],
                    'content' => $this->inlineNodes(
                        $headingText,
                        $noteReferenceByLegacySlug,
                        $mentions,
                        $hashtags,
                        $unresolvedWikiLinks,
                        $skipWiki,
                    ),
                ];

                continue;
            }

            if ($type === 'list_block') {
                $listNode = $this->listNodeFromMarkdown(
                    $blockMarkdown,
                    $blockPath,
                    $taskByPath,
                    $noteReferenceByLegacySlug,
                    $mentions,
                    $hashtags,
                    $unresolvedWikiLinks,
                    $skipWiki,
                );

                if ($listNode !== null) {
                    $content[] = $listNode;
                }

                continue;
            }

            if ($type === 'thematic_break') {
                $content[] = ['type' => 'horizontalRule'];

                continue;
            }

            if ($type === 'block_quote') {
                $quoteText = trim((string) preg_replace('/^\s*>\s?/m', '', $blockMarkdown));
                $content[] = [
                    'type' => 'blockquote',
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => $this->inlineNodes(
                            $quoteText,
                            $noteReferenceByLegacySlug,
                            $mentions,
                            $hashtags,
                            $unresolvedWikiLinks,
                            $skipWiki,
                        ),
                    ]],
                ];

                continue;
            }

            if ($type === 'html_block') {
                if (preg_match('/^\s*<br\s*\/?>\s*$/i', $blockMarkdown) === 1) {
                    $content[] = ['type' => 'paragraph'];

                    continue;
                }
            }

            $paragraphText = trim($blockMarkdown);
            if ($paragraphText === '' && trim($markdown) !== '') {
                continue;
            }

            $content[] = [
                'type' => 'paragraph',
                'content' => $this->inlineNodes(
                    $paragraphText,
                    $noteReferenceByLegacySlug,
                    $mentions,
                    $hashtags,
                    $unresolvedWikiLinks,
                    $skipWiki,
                ),
            ];
        }

        if ($content === []) {
            $content[] = [
                'type' => 'paragraph',
                'content' => $this->inlineNodes(
                    trim($markdown),
                    $noteReferenceByLegacySlug,
                    $mentions,
                    $hashtags,
                    $unresolvedWikiLinks,
                    $skipWiki,
                ),
            ];
        }

        return [
            'document' => [
                'type' => 'doc',
                'content' => $content,
            ],
            'mentions' => array_values(array_unique($mentions)),
            'hashtags' => array_values(array_unique($hashtags)),
            'unresolved_wikilinks' => array_values(array_unique($unresolvedWikiLinks)),
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $taskByPath
     * @param  array<string, array{id: string, href: string}>  $noteReferenceByLegacySlug
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @param  array<int, string>  $unresolvedWikiLinks
     * @return array<string, mixed>|null
     */
    private function listNodeFromMarkdown(
        string $markdown,
        string $blockPath,
        array $taskByPath,
        array $noteReferenceByLegacySlug,
        array &$mentions,
        array &$hashtags,
        array &$unresolvedWikiLinks,
        bool $skipWiki,
    ): ?array {
        $items = $this->parseMarkdownListItems($markdown);
        if ($items === []) {
            return null;
        }

        $isOrdered = preg_match('/^\d+[.)]$/', $items[0]['marker']) === 1;
        $allTaskItems = collect($items)
            ->every(fn (array $item): bool => preg_match('/^\[([ xX])\]\s+/', ltrim($item['text'])) === 1);

        $nodeType = $allTaskItems
            ? 'taskList'
            : ($isOrdered ? 'orderedList' : 'bulletList');

        $children = [];

        foreach ($items as $index => $item) {
            $path = "{$blockPath}.li_".($index + 1);
            $taskBlock = $taskByPath[$path] ?? null;
            $taskMeta = $this->decodeJsonField($taskBlock['meta'] ?? null);
            $taskData = Arr::get($taskMeta, 'task', []);

            if ($allTaskItems) {
                $taskText = ltrim($item['text']);
                preg_match('/^\[([ xX])\]\s*(.*)$/', $taskText, $matches);
                $checked = strtolower((string) ($matches[1] ?? '')) === 'x';
                $body = trim((string) ($matches[2] ?? $taskText));

                $attrs = [
                    'checked' => isset($taskData['checkbox'])
                        ? strtolower((string) $taskData['checkbox']) === 'x'
                        : $checked,
                ];

                $taskBlockId = is_array($taskBlock)
                    ? trim((string) ($taskBlock['block_id'] ?? ''))
                    : '';
                if ($taskBlockId !== '') {
                    $attrs['id'] = $taskBlockId;
                }

                $due = (string) ($taskData['due'] ?? '');
                if ($this->isValidIsoDate($due)) {
                    $attrs['dueDate'] = $due;
                }

                $deadline = (string) ($taskData['deadline'] ?? '');
                if ($this->isValidIsoDate($deadline)) {
                    $attrs['deadlineDate'] = $deadline;
                }

                $priority = match ((int) ($taskData['prio'] ?? 0)) {
                    3 => 'high',
                    2 => 'medium',
                    1 => 'normal',
                    default => null,
                };
                if ($priority !== null) {
                    $attrs['priority'] = $priority;
                }

                $children[] = [
                    'type' => 'taskItem',
                    'attrs' => $attrs,
                    'content' => [[
                        'type' => 'paragraph',
                        'content' => $this->inlineNodes(
                            $body,
                            $noteReferenceByLegacySlug,
                            $mentions,
                            $hashtags,
                            $unresolvedWikiLinks,
                            $skipWiki,
                        ),
                    ]],
                ];

                continue;
            }

            $children[] = [
                'type' => 'listItem',
                'content' => [[
                    'type' => 'paragraph',
                    'content' => $this->inlineNodes(
                        trim($item['text']),
                        $noteReferenceByLegacySlug,
                        $mentions,
                        $hashtags,
                        $unresolvedWikiLinks,
                        $skipWiki,
                    ),
                ]],
            ];
        }

        return [
            'type' => $nodeType,
            'content' => $children,
        ];
    }

    /**
     * @return array<int, array{marker: string, text: string}>
     */
    private function parseMarkdownListItems(string $markdown): array
    {
        $lines = preg_split('/\R/u', $markdown) ?: [];
        $items = [];
        $currentIndex = null;

        foreach ($lines as $line) {
            if (preg_match('/^\s*([*+-]|\d+[.)])\s+(.*)$/u', $line, $matches) === 1) {
                $items[] = [
                    'marker' => (string) $matches[1],
                    'text' => (string) $matches[2],
                ];
                $currentIndex = count($items) - 1;

                continue;
            }

            if ($currentIndex === null) {
                continue;
            }

            $trimmed = trim($line);
            if ($trimmed === '') {
                continue;
            }

            $items[$currentIndex]['text'] .= ' '.$trimmed;
        }

        return $items;
    }

    /**
     * @param  array<string, array{id: string, href: string}>  $noteReferenceByLegacySlug
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @param  array<int, string>  $unresolvedWikiLinks
     * @return array<int, array<string, mixed>>
     */
    private function inlineNodes(
        string $text,
        array $noteReferenceByLegacySlug,
        array &$mentions,
        array &$hashtags,
        array &$unresolvedWikiLinks,
        bool $skipWiki,
    ): array {
        $normalized = $this->unescapeLegacyMarkers($text);
        if ($normalized === '') {
            return [];
        }

        $nodes = [];
        $cursor = 0;
        $length = mb_strlen($normalized, 'UTF-8');

        while ($cursor < $length) {
            $slice = mb_substr($normalized, $cursor, null, 'UTF-8');
            if (preg_match('/\[\[([^\]\|\n]+)(?:\|([^\]\n]+))?\]\]/u', $slice, $match, PREG_OFFSET_CAPTURE) !== 1) {
                $nodes = [...$nodes, ...$this->mentionHashtagNodes($slice, $mentions, $hashtags)];
                break;
            }

            $full = (string) $match[0][0];
            $offset = (int) $match[0][1];

            if ($offset > 0) {
                $before = mb_substr($slice, 0, $offset, 'UTF-8');
                $nodes = [...$nodes, ...$this->mentionHashtagNodes($before, $mentions, $hashtags)];
            }

            $target = trim((string) ($match[1][0] ?? ''));
            $label = trim((string) ($match[2][0] ?? ''));
            $display = $label !== '' ? $label : $this->displayFromWikiTarget($target);

            $reference = $noteReferenceByLegacySlug[$target] ?? null;
            if (! $skipWiki && $reference !== null) {
                $nodes[] = [
                    'type' => 'text',
                    'text' => $display,
                    'marks' => [[
                        'type' => 'wikiLink',
                        'attrs' => [
                            'noteId' => $reference['id'],
                            'href' => $reference['href'],
                        ],
                    ]],
                ];
            } else {
                $nodes[] = [
                    'type' => 'text',
                    'text' => $full,
                ];
                if ($target !== '') {
                    $unresolvedWikiLinks[] = $target;
                }
            }

            $cursor += mb_strlen(mb_substr($slice, 0, $offset, 'UTF-8').$full, 'UTF-8');
        }

        return $this->mergeAdjacentTextNodes($nodes);
    }

    /**
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @return array<int, array<string, mixed>>
     */
    private function mentionHashtagNodes(string $text, array &$mentions, array &$hashtags): array
    {
        if ($text === '') {
            return [];
        }

        $pattern = '/(@[\p{L}\p{N}_-]+|#[\p{L}\p{N}_-]+)/u';
        if (preg_match($pattern, $text) !== 1) {
            return [[
                'type' => 'text',
                'text' => $text,
            ]];
        }

        $parts = preg_split($pattern, $text, -1, PREG_SPLIT_DELIM_CAPTURE);
        if (! is_array($parts)) {
            return [[
                'type' => 'text',
                'text' => $text,
            ]];
        }

        $nodes = [];
        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }

            if (preg_match('/^@([\p{L}\p{N}_-]+)$/u', $part, $match) === 1) {
                $label = (string) $match[1];
                $mentions[] = $label;
                $nodes[] = [
                    'type' => 'mention',
                    'attrs' => [
                        'id' => $label,
                        'label' => $label,
                        'mentionSuggestionChar' => '@',
                    ],
                ];

                continue;
            }

            if (preg_match('/^#([\p{L}\p{N}_-]+)$/u', $part, $match) === 1) {
                $label = (string) $match[1];
                $hashtags[] = $label;
                $nodes[] = [
                    'type' => 'hashtag',
                    'attrs' => [
                        'id' => $label,
                        'label' => $label,
                        'mentionSuggestionChar' => '#',
                    ],
                ];

                continue;
            }

            $nodes[] = [
                'type' => 'text',
                'text' => $part,
            ];
        }

        return $nodes;
    }

    private function displayFromWikiTarget(string $target): string
    {
        $trimmed = trim($target);
        if ($trimmed === '') {
            return 'Untitled';
        }

        $segments = explode('/', $trimmed);
        $last = trim((string) end($segments));

        return $last !== '' ? $last : $trimmed;
    }

    /**
     * @param  array<int, array<string, mixed>>  $nodes
     * @return array<int, array<string, mixed>>
     */
    private function mergeAdjacentTextNodes(array $nodes): array
    {
        $merged = [];
        foreach ($nodes as $node) {
            if (($node['type'] ?? null) !== 'text') {
                $merged[] = $node;

                continue;
            }

            $text = (string) ($node['text'] ?? '');
            if ($text === '') {
                continue;
            }

            $hasMarks = is_array($node['marks'] ?? null) && ($node['marks'] ?? []) !== [];
            if ($hasMarks) {
                $merged[] = $node;

                continue;
            }

            $lastIndex = count($merged) - 1;
            $lastHasMarks = $lastIndex >= 0
                && is_array($merged[$lastIndex]['marks'] ?? null)
                && ($merged[$lastIndex]['marks'] ?? []) !== [];
            if (
                $lastIndex >= 0
                && ($merged[$lastIndex]['type'] ?? null) === 'text'
                && ! $lastHasMarks
            ) {
                $merged[$lastIndex]['text'] = (string) ($merged[$lastIndex]['text'] ?? '').$text;

                continue;
            }

            $merged[] = [
                'type' => 'text',
                'text' => $text,
            ];
        }

        return $merged;
    }

    private function unescapeLegacyMarkers(string $text): string
    {
        return str_replace(
            ['\\[\\[', '\\]\\]', '\\#', '\\@', '\\*'],
            ['[[', ']]', '#', '@', '*'],
            $text,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJsonField(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function isValidIsoDate(string $value): bool
    {
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $match) !== 1) {
            return false;
        }

        return checkdate((int) $match[2], (int) $match[3], (int) $match[1]);
    }
}
