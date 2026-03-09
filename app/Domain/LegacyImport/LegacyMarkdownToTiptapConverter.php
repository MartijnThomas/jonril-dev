<?php

namespace App\Domain\LegacyImport;

use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class LegacyMarkdownToTiptapConverter
{
    /**
     * @param  array<int, array<string, mixed>>  $blocks
     * @param  array<string, array{id: string, href: string}>  $noteReferenceByLegacySlug
     * @return array{
     *   document: array<string, mixed>,
     *   mentions: array<int, string>,
     *   hashtags: array<int, string>,
     *   unresolved_wikilinks: array<int, string>,
     *   metrics: array{
     *     tasks_total: int,
     *     tasks_open: int,
     *     tasks_closed: int,
     *     tasks_with_legacy_ids: int,
     *     wikilinks: int,
     *     mentions: int,
     *     hashtags: int
     *   },
     *   pipeline: array{
     *     markdown: array{
     *       tasks_total: int,
     *       tasks_open: int,
     *       tasks_closed: int,
     *       tasks_with_legacy_ids: int,
     *       wikilinks: int,
     *       mentions: int,
     *       hashtags: int
     *     },
     *     enrichment: array{
     *       task_blocks_available: int,
     *       task_ids_assigned: int,
     *       task_ids_missing: int,
     *       missing_tasks: array<int, array{
     *         block_id: string,
     *         raw_markdown: string,
     *         priority: 'normal'|'medium'|'high'|null,
     *         mentions: array<int, string>,
     *         hashtags: array<int, string>,
     *         wikilinks: array<int, string>,
     *         due_date: string|null,
     *         deadline_date: string|null
     *       }>
     *     }
     *   }
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
        $missingTasks = [];

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

        $taskBlocksByRootPath = collect($blocks)
            ->filter(fn ($block) => is_array($block) && (($block['type'] ?? null) === 'task_item'))
            ->groupBy(function (array $block): string {
                $path = (string) ($block['path'] ?? '');
                if (preg_match('/^(b_\d+)\.li_\d+/', $path, $match) === 1) {
                    return $match[1];
                }

                return 'unknown';
            })
            ->map(function ($group): array {
                $rows = $group->values()->all();
                usort($rows, function (array $a, array $b): int {
                    return strcasecmp((string) ($a['path'] ?? ''), (string) ($b['path'] ?? ''));
                });

                return $rows;
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
                $blockId = trim((string) ($block['block_id'] ?? ''));
                $content[] = [
                    'type' => 'heading',
                    'attrs' => [
                        'level' => max(1, min(6, $level)),
                        ...($blockId !== '' ? ['legacy_id' => $blockId] : []),
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
                $taskBlocks = $taskBlocksByRootPath[$blockPath] ?? [];
                $listNodes = $this->listNodesFromMarkdown(
                    $blockMarkdown,
                    $taskBlocks,
                    $noteReferenceByLegacySlug,
                    $mentions,
                    $hashtags,
                    $unresolvedWikiLinks,
                    $missingTasks,
                    $skipWiki,
                );

                if ($listNodes !== []) {
                    $blockId = trim((string) ($block['block_id'] ?? ''));
                    if ($blockId !== '') {
                        $listNodes = array_map(function (array $node) use ($blockId): array {
                            $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
                            $attrs['legacy_id'] = $blockId;
                            $node['attrs'] = $attrs;

                            return $node;
                        }, $listNodes);
                    }
                    $content = [...$content, ...$listNodes];
                }

                continue;
            }

            if ($type === 'thematic_break') {
                $blockId = trim((string) ($block['block_id'] ?? ''));
                $content[] = [
                    'type' => 'horizontalRule',
                    'attrs' => $blockId !== '' ? ['legacy_id' => $blockId] : [],
                ];

                continue;
            }

            if ($type === 'block_quote') {
                $quoteText = trim((string) preg_replace('/^\s*>\s?/m', '', $blockMarkdown));
                $blockId = trim((string) ($block['block_id'] ?? ''));
                $content[] = [
                    'type' => 'blockquote',
                    'attrs' => $blockId !== '' ? ['legacy_id' => $blockId] : [],
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
                'attrs' => ($blockId = trim((string) ($block['block_id'] ?? ''))) !== ''
                    ? ['legacy_id' => $blockId]
                    : [],
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

        $document = [
            'type' => 'doc',
            'content' => $content,
        ];
        $document = $this->assignTiptapIds($document);
        $metrics = $this->collectDocumentMetrics($document);
        $taskBlocksCount = collect($blocks)
            ->filter(fn ($block): bool => is_array($block) && (($block['type'] ?? null) === 'task_item'))
            ->count();
        $taskIdsFromDocument = (int) ($metrics['tasks_with_legacy_ids'] ?? 0);
        $tasksTotal = (int) ($metrics['tasks_total'] ?? 0);

        return [
            'document' => $document,
            'mentions' => array_values(array_unique($mentions)),
            'hashtags' => array_values(array_unique($hashtags)),
            'unresolved_wikilinks' => array_values(array_unique($unresolvedWikiLinks)),
            'metrics' => $metrics,
            'pipeline' => [
                'markdown' => $metrics,
                'enrichment' => [
                    'task_blocks_available' => $taskBlocksCount,
                    'task_ids_assigned' => $taskIdsFromDocument,
                    'task_ids_missing' => max(0, $tasksTotal - $taskIdsFromDocument),
                    'missing_tasks' => collect($missingTasks)
                        ->unique(fn (array $item): string => sprintf(
                            '%s|%s|%s|%s',
                            (string) ($item['block_id'] ?? ''),
                            (string) ($item['raw_markdown'] ?? ''),
                            implode(',', (array) ($item['mentions'] ?? [])),
                            implode(',', (array) ($item['hashtags'] ?? [])),
                        ))
                        ->values()
                        ->all(),
                ],
            ],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $taskBlocks
     * @param  array<string, array{id: string, href: string}>  $noteReferenceByLegacySlug
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @param  array<int, string>  $unresolvedWikiLinks
     * @param  array<int, array{block_id: string, raw_markdown: string}>  $missingTasks
     * @return array<int, array<string, mixed>>
     */
    private function listNodesFromMarkdown(
        string $markdown,
        array $taskBlocks,
        array $noteReferenceByLegacySlug,
        array &$mentions,
        array &$hashtags,
        array &$unresolvedWikiLinks,
        array &$missingTasks,
        bool $skipWiki,
    ): array {
        $tree = $this->parseListTree($markdown);
        if ($tree === []) {
            return [];
        }

        $taskCursor = 0;

        return $this->buildListRunsFromTree(
            items: $tree,
            taskBlocks: $taskBlocks,
            taskCursor: $taskCursor,
            noteReferenceByLegacySlug: $noteReferenceByLegacySlug,
            mentions: $mentions,
            hashtags: $hashtags,
            unresolvedWikiLinks: $unresolvedWikiLinks,
            missingTasks: $missingTasks,
            skipWiki: $skipWiki,
        );
    }

    /**
     * @param  array<int, array{marker: string, text: string, indent: int, children: array}>  $items
     * @param  array<int, array<string, mixed>>  $taskBlocks
     * @param  array<string, array{id: string, href: string}>  $noteReferenceByLegacySlug
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @param  array<int, string>  $unresolvedWikiLinks
     * @param  array<int, array{block_id: string, raw_markdown: string}>  $missingTasks
     * @return array<int, array<string, mixed>>
     */
    private function buildListRunsFromTree(
        array $items,
        array $taskBlocks,
        int &$taskCursor,
        array $noteReferenceByLegacySlug,
        array &$mentions,
        array &$hashtags,
        array &$unresolvedWikiLinks,
        array &$missingTasks,
        bool $skipWiki,
    ): array {
        $runs = [];

        foreach ($items as $item) {
            $isTask = $this->isTaskItemText((string) ($item['text'] ?? ''));
            $isOrdered = preg_match('/^\d+[.)]$/', (string) ($item['marker'] ?? '')) === 1;
            $lastRun = end($runs);

            if (
                ! is_array($lastRun)
                || ($lastRun['is_task'] ?? null) !== $isTask
                || (! $isTask && (($lastRun['is_ordered'] ?? null) !== $isOrdered))
            ) {
                $runs[] = [
                    'is_task' => $isTask,
                    'is_ordered' => $isOrdered,
                    'items' => [],
                ];
            }

            $runs[count($runs) - 1]['items'][] = $item;
        }

        $result = [];

        foreach ($runs as $run) {
            if (($run['is_task'] ?? false) === true) {
                $taskItems = [];

                foreach ($run['items'] as $item) {
                    $taskBlock = $taskBlocks[$taskCursor] ?? null;
                    if (is_array($taskBlock)) {
                        $taskCursor++;
                    }

                    $taskItems[] = $this->buildTaskItemNode(
                        item: $item,
                        taskBlock: is_array($taskBlock) ? $taskBlock : null,
                        taskBlocks: $taskBlocks,
                        taskCursor: $taskCursor,
                        noteReferenceByLegacySlug: $noteReferenceByLegacySlug,
                        mentions: $mentions,
                        hashtags: $hashtags,
                        unresolvedWikiLinks: $unresolvedWikiLinks,
                        missingTasks: $missingTasks,
                        skipWiki: $skipWiki,
                    );
                }

                $result[] = [
                    'type' => 'taskList',
                    'content' => $taskItems,
                ];

                continue;
            }

            $listItems = [];
            foreach ($run['items'] as $item) {
                $parsedItemMeta = $this->parsePriorityStatusDateFromText((string) ($item['text'] ?? ''));
                $nodeContent = [[
                    'type' => 'paragraph',
                    'content' => $this->inlineNodes(
                        $parsedItemMeta['text'],
                        $noteReferenceByLegacySlug,
                        $mentions,
                        $hashtags,
                        $unresolvedWikiLinks,
                        $skipWiki,
                    ),
                ]];

                $children = $this->buildListRunsFromTree(
                    items: is_array($item['children'] ?? null) ? $item['children'] : [],
                    taskBlocks: $taskBlocks,
                    taskCursor: $taskCursor,
                    noteReferenceByLegacySlug: $noteReferenceByLegacySlug,
                    mentions: $mentions,
                    hashtags: $hashtags,
                    unresolvedWikiLinks: $unresolvedWikiLinks,
                    missingTasks: $missingTasks,
                    skipWiki: $skipWiki,
                );
                if ($children !== []) {
                    $nodeContent = [...$nodeContent, ...$children];
                }

                $listItem = [
                    'type' => 'listItem',
                    'content' => $nodeContent,
                ];

                if ($parsedItemMeta['priority'] !== null) {
                    $listItem['attrs'] = [
                        'priority' => $parsedItemMeta['priority'],
                    ];
                }

                $listItems[] = $listItem;
            }

            $result[] = [
                'type' => (($run['is_ordered'] ?? false) === true)
                    ? 'orderedList'
                    : 'bulletList',
                'content' => $listItems,
            ];
        }

        return $result;
    }

    /**
     * @param  array<string, mixed>|null  $taskBlock
     * @param  array<int, array<string, mixed>>  $taskBlocks
     * @param  array<string, array{id: string, href: string}>  $noteReferenceByLegacySlug
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @param  array<int, string>  $unresolvedWikiLinks
     * @param  array<int, array{block_id: string, raw_markdown: string}>  $missingTasks
     * @param  array{marker: string, text: string, indent: int, children: array}  $item
     * @return array<string, mixed>
     */
    private function buildTaskItemNode(
        array $item,
        ?array $taskBlock,
        array $taskBlocks,
        int &$taskCursor,
        array $noteReferenceByLegacySlug,
        array &$mentions,
        array &$hashtags,
        array &$unresolvedWikiLinks,
        array &$missingTasks,
        bool $skipWiki,
    ): array {
        $taskMeta = $this->decodeJsonField($taskBlock['meta'] ?? null);
        $taskData = Arr::get($taskMeta, 'task', []);

        $taskText = ltrim((string) ($item['text'] ?? ''));
        preg_match('/^\[([ xX])\]\s*(.*)$/', $taskText, $matches);
        $checked = strtolower((string) ($matches[1] ?? '')) === 'x';
        $body = trim((string) ($matches[2] ?? $taskText));
        $parsedMeta = $this->parsePriorityStatusDateFromText($body);

        $attrs = [
            'id' => (string) Str::uuid(),
            'checked' => isset($taskData['checkbox'])
                ? strtolower((string) $taskData['checkbox']) === 'x'
                : $checked,
        ];

        $taskBlockId = is_array($taskBlock)
            ? trim((string) ($taskBlock['block_id'] ?? ''))
            : '';
        if ($taskBlockId !== '') {
            $attrs['legacy_id'] = $taskBlockId;
        } else {
            $inlineSignals = $this->extractTaskInlineSignals($taskText);
            $missingTasks[] = [
                'block_id' => trim((string) (is_array($taskBlock)
                    ? (($taskBlock['block_id'] ?? '') !== '' ? $taskBlock['block_id'] : ($taskBlock['path'] ?? ''))
                    : '')),
                'raw_markdown' => '- '.$taskText,
                'priority' => $parsedMeta['priority'],
                'mentions' => $inlineSignals['mentions'],
                'hashtags' => $inlineSignals['hashtags'],
                'wikilinks' => $inlineSignals['wikilinks'],
                'due_date' => $parsedMeta['due_date'],
                'deadline_date' => $parsedMeta['deadline_date'],
            ];
        }

        $due = (string) ($taskData['due'] ?? '');
        if (! $this->isValidIsoDate($due) && $parsedMeta['due_date'] !== null) {
            $due = $parsedMeta['due_date'];
        }
        if ($this->isValidIsoDate($due)) {
            $attrs['dueDate'] = $due;
        }

        $deadline = (string) ($taskData['deadline'] ?? '');
        if (! $this->isValidIsoDate($deadline) && $parsedMeta['deadline_date'] !== null) {
            $deadline = $parsedMeta['deadline_date'];
        }
        if ($this->isValidIsoDate($deadline)) {
            $attrs['deadlineDate'] = $deadline;
        }

        $priority = match ((int) ($taskData['prio'] ?? 0)) {
            3 => 'high',
            2 => 'medium',
            1 => 'normal',
            default => null,
        };
        if ($priority === null) {
            $priority = $parsedMeta['priority'];
        }
        if ($priority !== null) {
            $attrs['priority'] = $priority;
        }

        $content = [[
            'type' => 'paragraph',
            'content' => $this->inlineNodes(
                $parsedMeta['text'],
                $noteReferenceByLegacySlug,
                $mentions,
                $hashtags,
                $unresolvedWikiLinks,
                $skipWiki,
            ),
        ]];

        $children = $this->buildListRunsFromTree(
            items: is_array($item['children'] ?? null) ? $item['children'] : [],
            taskBlocks: $taskBlocks,
            taskCursor: $taskCursor,
            noteReferenceByLegacySlug: $noteReferenceByLegacySlug,
            mentions: $mentions,
            hashtags: $hashtags,
            unresolvedWikiLinks: $unresolvedWikiLinks,
            missingTasks: $missingTasks,
            skipWiki: $skipWiki,
        );
        if ($children !== []) {
            $content = [...$content, ...$children];
        }

        return [
            'type' => 'taskItem',
            'attrs' => $attrs,
            'content' => $content,
        ];
    }

    /**
     * @return array<int, array{marker: string, text: string, indent: int, children: array}>
     */
    private function parseListTree(string $markdown): array
    {
        $lines = preg_split('/\R/u', $markdown) ?: [];
        $roots = [];
        $stack = [];

        foreach ($lines as $line) {
            if (preg_match('/^(\s*)([*+-]|\d+[.)])\s+(.*)$/u', $line, $matches) === 1) {
                $indentRaw = (string) ($matches[1] ?? '');
                $indentSpaces = mb_strlen(str_replace("\t", '    ', $indentRaw), 'UTF-8');
                $item = [
                    'marker' => (string) $matches[2],
                    'text' => (string) $matches[3],
                    'indent' => $indentSpaces,
                    'children' => [],
                ];

                while ($stack !== [] && ($stack[count($stack) - 1]['indent'] ?? 0) >= $indentSpaces) {
                    array_pop($stack);
                }

                if ($stack === []) {
                    $roots[] = $item;
                    $rootsIndex = count($roots) - 1;
                    $stack[] = [
                        'indent' => $indentSpaces,
                        'path' => [$rootsIndex],
                    ];
                } else {
                    $parentPath = $stack[count($stack) - 1]['path'] ?? [];
                    $parentChildren = &$this->childrenReferenceByPath($roots, $parentPath);
                    $parentChildren[] = $item;
                    $childIndex = count($parentChildren) - 1;
                    $stack[] = [
                        'indent' => $indentSpaces,
                        'path' => [
                            ...$parentPath,
                            $childIndex,
                        ],
                    ];
                    unset($parentChildren);
                }

                continue;
            }

            $trimmed = trim($line);
            if ($trimmed === '' || $stack === []) {
                continue;
            }

            $currentPath = $stack[count($stack) - 1]['path'] ?? [];
            if ($currentPath === []) {
                continue;
            }

            $target = &$this->itemReferenceByPath($roots, $currentPath);
            $target['text'] = rtrim((string) ($target['text'] ?? '')).' '.$trimmed;
            unset($target);
        }

        return $roots;
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

            $wikiMatch = null;
            if (preg_match('/\[\[([^\]\|\n]+)(?:\|([^\]\n]+))?\]\]/u', $slice, $match, PREG_OFFSET_CAPTURE) === 1) {
                $wikiMatch = [
                    'full' => (string) $match[0][0],
                    'offset' => (int) $match[0][1],
                    'target' => trim((string) ($match[1][0] ?? '')),
                    'label' => trim((string) ($match[2][0] ?? '')),
                ];
            }

            $markdownLinkMatch = $this->findMarkdownLink($slice);

            if ($wikiMatch === null && $markdownLinkMatch === null) {
                $nodes = [...$nodes, ...$this->plainTextNodes($slice, $mentions, $hashtags)];
                break;
            }

            $wikiOffset = $wikiMatch !== null ? $wikiMatch['offset'] : PHP_INT_MAX;
            $linkOffset = $markdownLinkMatch !== null ? $markdownLinkMatch['offset'] : PHP_INT_MAX;

            $useWiki = $wikiOffset <= $linkOffset;
            $selected = $useWiki ? $wikiMatch : $markdownLinkMatch;
            if (! is_array($selected)) {
                break;
            }

            $full = (string) ($selected['full'] ?? '');
            $offset = (int) ($selected['offset'] ?? 0);

            if ($offset > 0) {
                $before = mb_substr($slice, 0, $offset, 'UTF-8');
                $nodes = [...$nodes, ...$this->plainTextNodes($before, $mentions, $hashtags)];
            }

            if ($useWiki) {
                $target = (string) ($selected['target'] ?? '');
                $label = (string) ($selected['label'] ?? '');
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
                        'marks' => [[
                            'type' => 'highlight',
                            'attrs' => [
                                'color' => 'var(--tt-color-highlight-red)',
                            ],
                        ]],
                    ];
                    if ($target !== '') {
                        $unresolvedWikiLinks[] = $target;
                    }
                }
            } else {
                $labelRaw = (string) ($selected['label'] ?? '');
                $href = trim((string) ($selected['href'] ?? ''));
                $label = $this->normalizeMarkdownLinkLabel($labelRaw);

                if ($href !== '') {
                    $nodes[] = [
                        'type' => 'text',
                        'text' => $label !== '' ? $label : $href,
                        'marks' => [[
                            'type' => 'link',
                            'attrs' => [
                                'href' => $href,
                            ],
                        ]],
                    ];
                } else {
                    $nodes[] = [
                        'type' => 'text',
                        'text' => $full,
                    ];
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
    private function plainTextNodes(string $text, array &$mentions, array &$hashtags): array
    {
        if ($text === '') {
            return [];
        }

        $pattern = '/(@[\p{L}\p{N}_-]+|#[\p{L}\p{N}_-]+)/u';
        if (preg_match($pattern, $text) !== 1) {
            return $this->applySimpleMarkdownMarks($text);
        }

        $parts = preg_split($pattern, $text, -1, PREG_SPLIT_DELIM_CAPTURE);
        if (! is_array($parts)) {
            return $this->applySimpleMarkdownMarks($text);
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

            $nodes = [...$nodes, ...$this->applySimpleMarkdownMarks($part)];
        }

        return $nodes;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function applySimpleMarkdownMarks(string $text): array
    {
        if ($text === '') {
            return [];
        }

        $patterns = [
            [
                'type' => 'strong',
                'regex' => '/\*\*([^\n*][^\n]*?)\*\*/u',
                'mark' => 'bold',
            ],
            [
                'type' => 'highlight',
                'regex' => '/==([^\n=][^\n]*?)==/u',
                'mark' => 'highlight',
            ],
            [
                'type' => 'emphasis',
                'regex' => '/(?<!\*)\*([^\n*][^\n]*?)\*(?!\*)/u',
                'mark' => 'italic',
            ],
            [
                'type' => 'strike',
                'regex' => '/~~([^\n~][^\n]*?)~~/u',
                'mark' => 'strike',
            ],
        ];

        $earliest = null;
        foreach ($patterns as $pattern) {
            if (preg_match($pattern['regex'], $text, $match, PREG_OFFSET_CAPTURE) !== 1) {
                continue;
            }

            $offset = (int) $match[0][1];
            if ($earliest === null || $offset < $earliest['offset']) {
                $earliest = [
                    'offset' => $offset,
                    'full' => (string) $match[0][0],
                    'inner' => (string) ($match[1][0] ?? ''),
                    'mark' => (string) $pattern['mark'],
                ];
            }
        }

        if ($earliest === null) {
            return [[
                'type' => 'text',
                'text' => $text,
            ]];
        }

        $before = mb_substr($text, 0, $earliest['offset'], 'UTF-8');
        $afterStart = $earliest['offset'] + mb_strlen($earliest['full'], 'UTF-8');
        $after = mb_substr($text, $afterStart, null, 'UTF-8');

        $nodes = [];
        if ($before !== '') {
            $nodes = [...$nodes, ...$this->applySimpleMarkdownMarks($before)];
        }

        if ($earliest['inner'] !== '') {
            $nodes[] = [
                'type' => 'text',
                'text' => $earliest['inner'],
                'marks' => [[
                    'type' => $earliest['mark'],
                ]],
            ];
        }

        if ($after !== '') {
            $nodes = [...$nodes, ...$this->applySimpleMarkdownMarks($after)];
        }

        return $nodes;
    }

    /**
     * @return array{full: string, label: string, href: string, offset: int}|null
     */
    private function findMarkdownLink(string $text): ?array
    {
        $length = mb_strlen($text, 'UTF-8');

        for ($i = 0; $i < $length; $i++) {
            $char = mb_substr($text, $i, 1, 'UTF-8');
            if ($char !== '[') {
                continue;
            }

            $labelEnd = $this->findMatchingBracket($text, $i);
            if ($labelEnd === null) {
                continue;
            }

            $nextChar = mb_substr($text, $labelEnd + 1, 1, 'UTF-8');
            if ($nextChar !== '(') {
                continue;
            }

            $urlEnd = $this->findMatchingParen($text, $labelEnd + 1);
            if ($urlEnd === null) {
                continue;
            }

            $full = mb_substr($text, $i, $urlEnd - $i + 1, 'UTF-8');
            $label = mb_substr($text, $i + 1, $labelEnd - $i - 1, 'UTF-8');
            $href = mb_substr($text, $labelEnd + 2, $urlEnd - $labelEnd - 2, 'UTF-8');

            return [
                'full' => $full,
                'label' => $label,
                'href' => $href,
                'offset' => $i,
            ];
        }

        return null;
    }

    private function findMatchingBracket(string $text, int $start): ?int
    {
        $length = mb_strlen($text, 'UTF-8');
        $depth = 0;

        for ($i = $start; $i < $length; $i++) {
            $char = mb_substr($text, $i, 1, 'UTF-8');
            if ($char === '[') {
                $depth++;
            } elseif ($char === ']') {
                $depth--;
                if ($depth === 0) {
                    return $i;
                }
            }
        }

        return null;
    }

    private function findMatchingParen(string $text, int $start): ?int
    {
        $length = mb_strlen($text, 'UTF-8');
        $depth = 0;

        for ($i = $start; $i < $length; $i++) {
            $char = mb_substr($text, $i, 1, 'UTF-8');
            if ($char === '(') {
                $depth++;
            } elseif ($char === ')') {
                $depth--;
                if ($depth === 0) {
                    return $i;
                }
            }
        }

        return null;
    }

    private function normalizeMarkdownLinkLabel(string $rawLabel): string
    {
        $cleaned = preg_replace('/!\[[^\]]*\]\([^)]+\)/u', '', $rawLabel) ?? $rawLabel;
        $cleaned = trim($cleaned);

        if ($cleaned !== '') {
            return $cleaned;
        }

        if (preg_match('/!\[([^\]]*)\]\([^)]+\)/u', $rawLabel, $match) === 1) {
            return trim((string) ($match[1] ?? ''));
        }

        return '';
    }

    private function isTaskItemText(string $text): bool
    {
        return preg_match('/^\[([ xX])\]\s*/', ltrim($text)) === 1;
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

    /**
     * @return array{
     *   mentions: array<int, string>,
     *   hashtags: array<int, string>,
     *   wikilinks: array<int, string>
     * }
     */
    private function extractTaskInlineSignals(string $text): array
    {
        $normalized = $this->unescapeLegacyMarkers($text);
        $mentions = [];
        $hashtags = [];
        $wikilinks = [];

        if (preg_match_all('/@([\p{L}\p{N}_-]+)/u', $normalized, $mentionMatches) >= 1) {
            $mentions = collect($mentionMatches[1] ?? [])
                ->filter(fn (mixed $item): bool => is_string($item) && trim($item) !== '')
                ->map(fn (string $item): string => trim($item))
                ->unique(fn (string $item): string => mb_strtolower($item))
                ->values()
                ->all();
        }

        if (preg_match_all('/#([\p{L}\p{N}_-]+)/u', $normalized, $hashtagMatches) >= 1) {
            $hashtags = collect($hashtagMatches[1] ?? [])
                ->filter(fn (mixed $item): bool => is_string($item) && trim($item) !== '')
                ->map(fn (string $item): string => trim($item))
                ->unique(fn (string $item): string => mb_strtolower($item))
                ->values()
                ->all();
        }

        if (preg_match_all('/\[\[([^\]\|\n]+)(?:\|([^\]\n]+))?\]\]/u', $normalized, $wikiMatches, PREG_SET_ORDER) >= 1) {
            $wikilinks = collect($wikiMatches)
                ->map(fn (array $match): string => trim((string) ($match[1] ?? '')))
                ->filter(fn (string $item): bool => $item !== '')
                ->unique(fn (string $item): string => mb_strtolower($item))
                ->values()
                ->all();
        }

        return [
            'mentions' => $mentions,
            'hashtags' => $hashtags,
            'wikilinks' => $wikilinks,
        ];
    }

    /**
     * @param  array<string, mixed>  $node
     * @return array<string, mixed>
     */
    private function assignTiptapIds(array $node): array
    {
        $type = (string) ($node['type'] ?? '');
        $skipIdTypes = ['text', 'mention', 'hashtag'];

        if (! in_array($type, $skipIdTypes, true)) {
            $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];
            $nodeId = trim((string) ($attrs['id'] ?? ''));
            if ($nodeId === '') {
                $attrs['id'] = (string) Str::uuid();
            }
            $node['attrs'] = $attrs;
        }

        if (is_array($node['content'] ?? null)) {
            $node['content'] = array_map(function (mixed $child): mixed {
                if (! is_array($child)) {
                    return $child;
                }

                return $this->assignTiptapIds($child);
            }, $node['content']);
        }

        return $node;
    }

    /**
     * @return array{
     *   text: string,
     *   priority: 'normal'|'medium'|'high'|null,
     *   due_date: string|null,
     *   deadline_date: string|null
     * }
     */
    private function parsePriorityStatusDateFromText(string $text): array
    {
        $working = trim($this->unescapeLegacyMarkers($text));
        $priority = null;
        $dueDate = null;
        $deadlineDate = null;

        if (preg_match('/^\s*(!{1,3})(?=\s|$|[.,;:!?)]|\()/u', $working, $priorityMatch) === 1) {
            $priority = match (strlen((string) $priorityMatch[1])) {
                3 => 'high',
                2 => 'medium',
                default => 'normal',
            };
            $working = trim((string) preg_replace('/^\s*!{1,3}\s*/u', '', $working, 1));
        }

        if (
            preg_match_all('/(?:^|[\s(])(?:(>{2}|>{1}))\s*(\d{4}-\d{2}-\d{2})(?=$|[\s)\].,;:!?])/u', $working, $dateMatches, PREG_SET_ORDER) >= 1
        ) {
            foreach ($dateMatches as $match) {
                $marker = (string) ($match[1] ?? '');
                $date = (string) ($match[2] ?? '');
                if (! $this->isValidIsoDate($date)) {
                    continue;
                }

                if ($marker === '>>') {
                    $deadlineDate = $date;
                } else {
                    $dueDate = $date;
                }
            }
        }

        $working = trim((string) preg_replace('/(?:^|[\s(])>{1,2}\s*\d{4}-\d{2}-\d{2}(?=$|[\s)\].,;:!?])/u', ' ', $working));
        $working = preg_replace('/\s+/u', ' ', $working) ?? $working;

        return [
            'text' => trim($working),
            'priority' => $priority,
            'due_date' => $dueDate,
            'deadline_date' => $deadlineDate,
        ];
    }

    /**
     * @param  array<string, mixed>  $document
     * @return array{
     *   tasks_total: int,
     *   tasks_open: int,
     *   tasks_closed: int,
     *   tasks_with_legacy_ids: int,
     *   wikilinks: int,
     *   mentions: int,
     *   hashtags: int
     * }
     */
    private function collectDocumentMetrics(array $document): array
    {
        $tasksTotal = 0;
        $tasksOpen = 0;
        $tasksClosed = 0;
        $tasksWithLegacyIds = 0;
        $wiki = [];
        $mentions = [];
        $hashtags = [];

        $walk = function (array $nodes) use (&$walk, &$tasksTotal, &$tasksOpen, &$tasksClosed, &$tasksWithLegacyIds, &$wiki, &$mentions, &$hashtags): void {
            foreach ($nodes as $node) {
                if (! is_array($node)) {
                    continue;
                }

                $type = (string) ($node['type'] ?? '');
                if ($type === 'taskItem') {
                    $tasksTotal++;
                    $checked = (bool) Arr::get($node, 'attrs.checked', false);
                    $legacyId = trim((string) Arr::get($node, 'attrs.legacy_id', ''));
                    if ($legacyId !== '') {
                        $tasksWithLegacyIds++;
                    }
                    if ($checked) {
                        $tasksClosed++;
                    } else {
                        $tasksOpen++;
                    }
                }

                if ($type === 'mention') {
                    $id = trim((string) Arr::get($node, 'attrs.id', ''));
                    if ($id !== '') {
                        $mentions[mb_strtolower($id)] = true;
                    }
                }

                if ($type === 'hashtag') {
                    $id = trim((string) Arr::get($node, 'attrs.id', ''));
                    if ($id !== '') {
                        $hashtags[mb_strtolower($id)] = true;
                    }
                }

                if ($type === 'text') {
                    foreach ((array) ($node['marks'] ?? []) as $mark) {
                        if (! is_array($mark) || (($mark['type'] ?? null) !== 'wikiLink')) {
                            continue;
                        }

                        $wikiKey = sprintf(
                            '%s|%s|%s',
                            (string) Arr::get($mark, 'attrs.noteId', ''),
                            (string) Arr::get($mark, 'attrs.href', ''),
                            (string) ($node['text'] ?? ''),
                        );
                        $wiki[$wikiKey] = true;
                    }
                }

                $childNodes = $node['content'] ?? null;
                if (is_array($childNodes)) {
                    $walk($childNodes);
                }
            }
        };

        $content = $document['content'] ?? [];
        if (is_array($content)) {
            $walk($content);
        }

        return [
            'tasks_total' => $tasksTotal,
            'tasks_open' => $tasksOpen,
            'tasks_closed' => $tasksClosed,
            'tasks_with_legacy_ids' => $tasksWithLegacyIds,
            'wikilinks' => count($wiki),
            'mentions' => count($mentions),
            'hashtags' => count($hashtags),
        ];
    }

    /**
     * @param  array<int, array{marker: string, text: string, indent: int, children: array}>  $roots
     * @param  array<int, int>  $path
     */
    private function &itemReferenceByPath(array &$roots, array $path): mixed
    {
        $ref = &$roots[$path[0]];
        for ($i = 1; $i < count($path); $i++) {
            $ref = &$ref['children'][$path[$i]];
        }

        return $ref;
    }

    /**
     * @param  array<int, array{marker: string, text: string, indent: int, children: array}>  $roots
     * @param  array<int, int>  $path
     */
    private function &childrenReferenceByPath(array &$roots, array $path): mixed
    {
        if ($path === []) {
            return $roots;
        }

        $itemRef = &$this->itemReferenceByPath($roots, $path);
        $childrenRef = &$itemRef['children'];

        return $childrenRef;
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

    private function unescapeLegacyMarkers(string $text): string
    {
        $unescaped = str_replace(
            ['\\[\\[', '\\]\\]', '\\#', '\\@', '\\*'],
            ['[[', ']]', '#', '@', '*'],
            $text,
        );

        return html_entity_decode($unescaped, ENT_QUOTES | ENT_HTML5, 'UTF-8');
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
