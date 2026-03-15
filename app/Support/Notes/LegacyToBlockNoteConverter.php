<?php

namespace App\Support\Notes;

use App\Models\Note;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class LegacyToBlockNoteConverter
{
    /**
     * @param  array<string, mixed>|string|null  $content
     * @return array{
     *     changed: bool,
     *     document: array<string, mixed>,
     *     was_block_document: bool,
     *     added_leading_heading: bool
     * }
     */
    public function convertNote(Note $note): array
    {
        $document = $this->normalizeDocument($note->content);

        if ($document === null) {
            $document = [
                'type' => 'doc',
                'content' => [],
            ];
        }

        $wasBlockDocument = $this->isBlockDocument($document);
        $usedIds = [];

        if ($wasBlockDocument) {
            $convertedNodes = $this->normalizeExistingBlockNodes(
                Arr::get($document, 'content', []),
                $usedIds,
            );
        } else {
            $convertedNodes = $this->convertNodes(
                Arr::get($document, 'content', []),
                0,
                $usedIds,
            );
        }

        $addedLeadingHeading = false;
        if (in_array($note->type, [Note::TYPE_NOTE, Note::TYPE_JOURNAL], true)) {
            [$convertedNodes, $addedLeadingHeading] = $this->ensureLeadingHeading(
                $convertedNodes,
                $note->title,
                $usedIds,
            );
        }

        if ($convertedNodes === []) {
            $fallbackHeadingId = $this->ensureUniqueId(null, $usedIds);
            $fallbackTitle = $this->cleanHeadingText($note->title ?? 'Untitled');

            $convertedNodes[] = [
                'type' => 'heading',
                'attrs' => [
                    'id' => $fallbackHeadingId,
                    'level' => 1,
                ],
                'content' => $fallbackTitle !== ''
                    ? [['type' => 'text', 'text' => $fallbackTitle]]
                    : [],
            ];
        }

        $convertedDocument = [
            'type' => 'doc',
            'content' => $convertedNodes,
        ];

        return [
            'changed' => $this->documentHash($document) !== $this->documentHash($convertedDocument),
            'document' => $convertedDocument,
            'was_block_document' => $wasBlockDocument,
            'added_leading_heading' => $addedLeadingHeading,
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function normalizeDocument(mixed $content): ?array
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

    /**
     * @param  array<string, mixed>  $document
     */
    private function isBlockDocument(array $document): bool
    {
        if (($document['type'] ?? null) !== 'doc') {
            return false;
        }

        $nodes = Arr::get($document, 'content', []);
        if (! is_array($nodes)) {
            return false;
        }

        foreach ($nodes as $node) {
            if (! is_array($node)) {
                return false;
            }

            $type = (string) ($node['type'] ?? '');
            if (! in_array($type, ['heading', 'paragraph'], true)) {
                return false;
            }

            if ($type === 'paragraph') {
                $attrs = Arr::get($node, 'attrs', []);
                if (! is_array($attrs)) {
                    return false;
                }

                if (! array_key_exists('blockStyle', $attrs)) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  array<string, bool>  $usedIds
     * @return array<int, array<string, mixed>>
     */
    private function normalizeExistingBlockNodes(array $nodes, array &$usedIds): array
    {
        $normalized = [];

        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            $type = (string) ($node['type'] ?? '');
            if (! in_array($type, ['heading', 'paragraph'], true)) {
                continue;
            }

            if ($type === 'heading') {
                $level = max(1, min(6, (int) Arr::get($node, 'attrs.level', 1)));
                $id = $this->ensureUniqueId(Arr::get($node, 'attrs.id'), $usedIds);
                $content = $this->normalizeInlineContent(Arr::get($node, 'content', []), true);

                $normalized[] = [
                    'type' => 'heading',
                    'attrs' => [
                        'id' => $id,
                        'level' => $level,
                    ],
                    'content' => $content,
                ];

                continue;
            }

            $normalized[] = $this->createParagraphNode(
                style: (string) Arr::get($node, 'attrs.blockStyle', 'paragraph'),
                indent: max(0, (int) Arr::get($node, 'attrs.indent', 0)),
                content: Arr::get($node, 'content', []),
                usedIds: $usedIds,
                existingAttrs: Arr::get($node, 'attrs', []),
                order: is_numeric(Arr::get($node, 'attrs.order'))
                    ? max(1, (int) Arr::get($node, 'attrs.order'))
                    : 1,
            );
        }

        return $normalized;
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  array<string, bool>  $usedIds
     * @return array<int, array<string, mixed>>
     */
    private function convertNodes(array $nodes, int $indent, array &$usedIds): array
    {
        $converted = [];

        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            $type = (string) ($node['type'] ?? '');

            if ($type === 'heading') {
                $level = max(1, min(6, (int) Arr::get($node, 'attrs.level', 1)));
                $id = $this->ensureUniqueId(Arr::get($node, 'attrs.id'), $usedIds);
                $content = $this->normalizeInlineContent(Arr::get($node, 'content', []), true);

                $converted[] = [
                    'type' => 'heading',
                    'attrs' => [
                        'id' => $id,
                        'level' => $level,
                    ],
                    'content' => $content,
                ];

                continue;
            }

            if ($type === 'paragraph') {
                $converted[] = $this->createParagraphNode(
                    style: 'paragraph',
                    indent: $indent,
                    content: Arr::get($node, 'content', []),
                    usedIds: $usedIds,
                    existingAttrs: Arr::get($node, 'attrs', []),
                );

                continue;
            }

            if ($type === 'blockquote') {
                $converted = [
                    ...$converted,
                    ...$this->convertQuoteNodes(Arr::get($node, 'content', []), $indent, $usedIds),
                ];

                continue;
            }

            if (in_array($type, ['bulletList', 'orderedList', 'taskList', 'checkList'], true)) {
                $converted = [
                    ...$converted,
                    ...$this->convertListNodes($type, Arr::get($node, 'content', []), $indent, $usedIds),
                ];

                continue;
            }

            if (is_array(Arr::get($node, 'content'))) {
                $converted = [
                    ...$converted,
                    ...$this->convertNodes(Arr::get($node, 'content', []), $indent, $usedIds),
                ];
            }
        }

        return $converted;
    }

    /**
     * @param  array<int, mixed>  $nodes
     * @param  array<string, bool>  $usedIds
     * @return array<int, array<string, mixed>>
     */
    private function convertQuoteNodes(array $nodes, int $indent, array &$usedIds): array
    {
        $converted = [];

        foreach ($nodes as $node) {
            if (! is_array($node)) {
                continue;
            }

            $type = (string) ($node['type'] ?? '');
            if ($type === 'paragraph') {
                $converted[] = $this->createParagraphNode(
                    style: 'quote',
                    indent: $indent,
                    content: Arr::get($node, 'content', []),
                    usedIds: $usedIds,
                    existingAttrs: Arr::get($node, 'attrs', []),
                );

                continue;
            }

            if (in_array($type, ['bulletList', 'orderedList', 'taskList', 'checkList'], true)) {
                $converted = [
                    ...$converted,
                    ...$this->convertListNodes($type, Arr::get($node, 'content', []), $indent + 1, $usedIds),
                ];

                continue;
            }

            if ($type === 'blockquote') {
                $converted = [
                    ...$converted,
                    ...$this->convertQuoteNodes(Arr::get($node, 'content', []), $indent + 1, $usedIds),
                ];

                continue;
            }

            if ($type === 'heading') {
                $id = $this->ensureUniqueId(Arr::get($node, 'attrs.id'), $usedIds);
                $level = max(1, min(6, (int) Arr::get($node, 'attrs.level', 1)));

                $converted[] = [
                    'type' => 'heading',
                    'attrs' => [
                        'id' => $id,
                        'level' => $level,
                    ],
                    'content' => $this->normalizeInlineContent(Arr::get($node, 'content', []), true),
                ];
            }
        }

        return $converted;
    }

    /**
     * @param  array<int, mixed>  $items
     * @param  array<string, bool>  $usedIds
     * @return array<int, array<string, mixed>>
     */
    private function convertListNodes(string $listType, array $items, int $indent, array &$usedIds): array
    {
        $converted = [];
        $order = 1;
        $paragraphStyle = match ($listType) {
            'bulletList' => 'bullet',
            'orderedList' => 'ordered',
            'taskList' => 'task',
            'checkList' => 'checklist',
            default => 'paragraph',
        };

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $itemAttrs = Arr::get($item, 'attrs', []);
            $itemNodes = Arr::get($item, 'content', []);
            if (! is_array($itemNodes)) {
                continue;
            }

            $renderedPrimary = false;
            foreach ($itemNodes as $child) {
                if (! is_array($child)) {
                    continue;
                }

                $childType = (string) ($child['type'] ?? '');
                if ($childType === 'paragraph') {
                    if (! $renderedPrimary) {
                        $converted[] = $this->createParagraphNode(
                            style: $paragraphStyle,
                            indent: $indent,
                            content: Arr::get($child, 'content', []),
                            usedIds: $usedIds,
                            existingAttrs: [
                                ...is_array($itemAttrs) ? $itemAttrs : [],
                                ...is_array(Arr::get($child, 'attrs')) ? Arr::get($child, 'attrs') : [],
                            ],
                            order: $paragraphStyle === 'ordered' ? $order : null,
                            checked: in_array($paragraphStyle, ['task', 'checklist'], true)
                                ? (bool) Arr::get($itemAttrs, 'checked', false)
                                : null,
                        );
                        $renderedPrimary = true;

                        if ($paragraphStyle === 'ordered') {
                            $order++;
                        }

                        continue;
                    }

                    $converted[] = $this->createParagraphNode(
                        style: 'paragraph',
                        indent: $indent + 1,
                        content: Arr::get($child, 'content', []),
                        usedIds: $usedIds,
                        existingAttrs: Arr::get($child, 'attrs', []),
                    );

                    continue;
                }

                if (in_array($childType, ['bulletList', 'orderedList', 'taskList', 'checkList'], true)) {
                    $converted = [
                        ...$converted,
                        ...$this->convertListNodes($childType, Arr::get($child, 'content', []), $indent + 1, $usedIds),
                    ];

                    continue;
                }

                if ($childType === 'blockquote') {
                    $converted = [
                        ...$converted,
                        ...$this->convertQuoteNodes(Arr::get($child, 'content', []), $indent + 1, $usedIds),
                    ];

                    continue;
                }

                if ($childType === 'heading') {
                    $id = $this->ensureUniqueId(Arr::get($child, 'attrs.id'), $usedIds);
                    $converted[] = [
                        'type' => 'heading',
                        'attrs' => [
                            'id' => $id,
                            'level' => max(1, min(6, (int) Arr::get($child, 'attrs.level', 1))),
                        ],
                        'content' => $this->normalizeInlineContent(Arr::get($child, 'content', []), true),
                    ];
                }
            }

            if (! $renderedPrimary) {
                $converted[] = $this->createParagraphNode(
                    style: $paragraphStyle,
                    indent: $indent,
                    content: [],
                    usedIds: $usedIds,
                    existingAttrs: is_array($itemAttrs) ? $itemAttrs : [],
                    order: $paragraphStyle === 'ordered' ? $order : null,
                    checked: in_array($paragraphStyle, ['task', 'checklist'], true)
                        ? (bool) Arr::get($itemAttrs, 'checked', false)
                        : null,
                );
                if ($paragraphStyle === 'ordered') {
                    $order++;
                }
            }
        }

        return $converted;
    }

    /**
     * @param  array<int, mixed>  $content
     * @param  array<string, bool>  $usedIds
     * @param  array<string, mixed>  $existingAttrs
     * @return array<string, mixed>
     */
    private function createParagraphNode(
        string $style,
        int $indent,
        array $content,
        array &$usedIds,
        array $existingAttrs = [],
        ?int $order = null,
        ?bool $checked = null,
    ): array {
        $normalizedStyle = in_array($style, ['paragraph', 'quote', 'bullet', 'ordered', 'task', 'checklist'], true)
            ? $style
            : 'paragraph';
        $priority = $this->normalizePriority(Arr::get($existingAttrs, 'priority'));
        $normalizedContent = $this->normalizeInlineContent($content, false);
        if ($normalizedStyle === 'task') {
            $normalizedContent = $this->normalizeLegacyTaskTextPrefixes($normalizedContent);
        }
        $deferredTaskData = $normalizedStyle === 'task'
            ? $this->extractLegacyDeferredTaskData($normalizedContent)
            : ['has_deferred_prefix' => false, 'assignee' => null, 'content' => $normalizedContent];
        $normalizedContent = $deferredTaskData['content'];

        if (in_array($normalizedStyle, ['task', 'bullet', 'ordered'], true) && $priority !== null) {
            $normalizedContent = $this->stripHighlightMarks($normalizedContent);
        }

        if (in_array($normalizedStyle, ['task', 'bullet', 'ordered'], true)) {
            $normalizedContent = $this->prependPriorityToken($normalizedContent, $priority);
        }

        $taskStatus = $this->normalizeOptionalString(Arr::get($existingAttrs, 'taskStatus'));
        $assignee = $this->normalizeOptionalString(Arr::get($existingAttrs, 'assignee'));
        if ($normalizedStyle === 'task' && ($deferredTaskData['has_deferred_prefix'] ?? false) === true) {
            $inferredAssignee = is_string($deferredTaskData['assignee'] ?? null)
                ? trim((string) $deferredTaskData['assignee'])
                : '';
            if ($inferredAssignee !== '') {
                $taskStatus = 'assigned';
                $assignee = $inferredAssignee;
            } else {
                $taskStatus = 'deferred';
                $assignee = null;
            }
        }

        $attrs = [
            'id' => $this->ensureUniqueId(Arr::get($existingAttrs, 'id'), $usedIds),
            'indent' => max(0, $indent),
            'blockStyle' => $normalizedStyle,
            'order' => $normalizedStyle === 'ordered' ? max(1, (int) ($order ?? Arr::get($existingAttrs, 'order', 1))) : 1,
            'checked' => in_array($normalizedStyle, ['task', 'checklist'], true)
                ? (bool) ($checked ?? Arr::get($existingAttrs, 'checked', false))
                : false,
            'priority' => $priority,
            'taskStatus' => $normalizedStyle === 'task' ? $taskStatus : null,
            'assignee' => $normalizedStyle === 'task' ? $assignee : null,
            'dueDate' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'dueDate')),
            'deadlineDate' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'deadlineDate')),
            'startedAt' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'startedAt')),
            'completedAt' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'completedAt')),
            'canceledAt' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'canceledAt')),
            'backlogPromotedAt' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'backlogPromotedAt')),
            'migratedAt' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'migratedAt')),
            'migratedToNoteId' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'migratedToNoteId')),
            'migratedFromNoteId' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'migratedFromNoteId')),
            'migratedFromBlockId' => $this->normalizeOptionalString(Arr::get($existingAttrs, 'migratedFromBlockId')),
        ];

        return [
            'type' => 'paragraph',
            'attrs' => $attrs,
            'content' => $normalizedContent,
        ];
    }

    private function normalizePriority(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $priority = trim($value);

        return in_array($priority, ['normal', 'medium', 'high'], true) ? $priority : null;
    }

    /**
     * @param  array<int, array<string, mixed>>  $content
     * @return array<int, array<string, mixed>>
     */
    private function prependPriorityToken(array $content, ?string $priority): array
    {
        $token = match ($priority) {
            'normal' => '!',
            'medium' => '!!',
            'high' => '!!!',
            default => null,
        };

        if ($token === null) {
            return $content;
        }

        foreach ($content as $index => $inlineNode) {
            if (($inlineNode['type'] ?? null) !== 'text') {
                continue;
            }

            $text = (string) ($inlineNode['text'] ?? '');
            if ($text === '') {
                continue;
            }

            if (preg_match('/^(?:[?\/\*\-]\s)?!{1,3}(?=\s|$)/u', $text) === 1) {
                return $content;
            }

            if (preg_match('/^([?\/\*\-]\s)(.*)$/us', $text, $matches) === 1) {
                $content[$index]['text'] = $matches[1].$token.' '.$matches[2];
            } else {
                $content[$index]['text'] = $token.' '.$text;
            }

            return $content;
        }

        array_unshift($content, [
            'type' => 'text',
            'text' => $token.' ',
        ]);

        return $content;
    }

    /**
     * @param  array<int, array<string, mixed>>  $content
     * @return array<int, array<string, mixed>>
     */
    private function normalizeLegacyTaskTextPrefixes(array $content): array
    {
        foreach ($content as $index => $inlineNode) {
            if (($inlineNode['type'] ?? null) !== 'text') {
                continue;
            }

            $text = (string) ($inlineNode['text'] ?? '');
            if ($text === '') {
                continue;
            }

            $content[$index]['text'] = preg_replace('/^[—–]\s+/u', '- ', $text) ?? $text;
            break;
        }

        return $content;
    }

    /**
     * @param  array<int, array<string, mixed>>  $content
     * @return array{
     *   has_deferred_prefix: bool,
     *   assignee: string|null,
     *   content: array<int, array<string, mixed>>
     * }
     */
    private function extractLegacyDeferredTaskData(array $content): array
    {
        $hasDeferredPrefix = false;
        $deferredTextIndex = null;
        $deferredOriginalText = null;
        foreach ($content as $index => $inlineNode) {
            if (($inlineNode['type'] ?? null) !== 'text') {
                continue;
            }

            $text = (string) ($inlineNode['text'] ?? '');
            if ($text === '') {
                continue;
            }

            if (preg_match('/^\s*<\s+/u', $text) === 1) {
                $content[$index]['text'] = preg_replace('/^\s*<\s+/u', '', $text, 1) ?? $text;
                $hasDeferredPrefix = true;
                $deferredTextIndex = $index;
                $deferredOriginalText = $text;
            }

            break;
        }

        if (! $hasDeferredPrefix) {
            return [
                'has_deferred_prefix' => false,
                'assignee' => null,
                'content' => $content,
            ];
        }

        $combinedText = collect($content)
            ->filter(fn (mixed $node): bool => is_array($node) && (($node['type'] ?? null) === 'text'))
            ->map(fn (array $node): string => (string) ($node['text'] ?? ''))
            ->implode('');

        $assignee = null;
        if (preg_match('/@([\p{L}\p{N}_-]+)/u', $combinedText, $match) === 1) {
            $candidate = trim((string) ($match[1] ?? ''));
            $assignee = $candidate !== '' ? $candidate : null;
        }

        if ($assignee === null && $deferredTextIndex !== null && $deferredOriginalText !== null) {
            $stripped = preg_replace('/^\s*<\s+/u', '', $deferredOriginalText) ?? $deferredOriginalText;
            $content[$deferredTextIndex]['text'] = '< '.ltrim($stripped);
        }

        $content = array_values(array_filter(
            $content,
            function (mixed $node): bool {
                if (! is_array($node)) {
                    return false;
                }

                if (($node['type'] ?? null) !== 'text') {
                    return true;
                }

                return ((string) ($node['text'] ?? '')) !== '';
            },
        ));

        return [
            'has_deferred_prefix' => true,
            'assignee' => $assignee,
            'content' => $content,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $content
     * @return array<int, array<string, mixed>>
     */
    private function stripHighlightMarks(array $content): array
    {
        foreach ($content as $index => $inlineNode) {
            $marks = Arr::get($inlineNode, 'marks');
            if (! is_array($marks)) {
                continue;
            }

            $filteredMarks = array_values(array_filter(
                $marks,
                fn ($mark) => ! (is_array($mark) && (($mark['type'] ?? null) === 'highlight')),
            ));

            if ($filteredMarks === []) {
                unset($content[$index]['marks']);

                continue;
            }

            $content[$index]['marks'] = $filteredMarks;
        }

        return $content;
    }

    private function normalizeOptionalString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed !== '' ? $trimmed : null;
    }

    /**
     * @param  array<int, mixed>  $content
     * @return array<int, array<string, mixed>>
     */
    private function normalizeInlineContent(array $content, bool $stripHeadingPrefix): array
    {
        $normalized = [];

        foreach ($content as $node) {
            if (! is_array($node)) {
                continue;
            }

            $type = (string) ($node['type'] ?? '');
            if ($type === 'text') {
                $text = (string) ($node['text'] ?? '');
                if ($text === '') {
                    continue;
                }

                $normalized[] = [
                    'type' => 'text',
                    'text' => $text,
                    ...is_array(Arr::get($node, 'marks'))
                        ? ['marks' => Arr::get($node, 'marks')]
                        : [],
                ];

                continue;
            }

            if ($type === 'hardBreak') {
                $normalized[] = $node;

                continue;
            }

            if (in_array($type, ['mention', 'hashtag'], true)) {
                $normalized[] = [
                    'type' => 'text',
                    'text' => $this->inlineTokenText(
                        $type,
                        Arr::get($node, 'attrs', []),
                        Arr::get($node, 'text'),
                    ),
                ];

                continue;
            }

            $children = Arr::get($node, 'content', []);
            if (is_array($children)) {
                $normalized = [
                    ...$normalized,
                    ...$this->normalizeInlineContent($children, false),
                ];
            }
        }

        if ($stripHeadingPrefix) {
            foreach ($normalized as $index => $inline) {
                if (($inline['type'] ?? null) !== 'text') {
                    continue;
                }

                $cleanText = $this->cleanHeadingText((string) ($inline['text'] ?? ''));
                $normalized[$index]['text'] = $cleanText;
                break;
            }
        }

        return $normalized;
    }

    /**
     * @param  array<string, mixed>  $attrs
     */
    private function inlineTokenText(string $type, array $attrs, mixed $fallbackText): string
    {
        $prefix = $type === 'mention' ? '@' : '#';
        $label = trim((string) ($attrs['label'] ?? ''));
        $id = trim((string) ($attrs['id'] ?? ''));
        $raw = trim((string) (is_string($fallbackText) ? $fallbackText : ($label !== '' ? $label : $id)));

        if ($raw === '') {
            return $prefix;
        }

        if (str_starts_with($raw, '@') || str_starts_with($raw, '#')) {
            return $raw;
        }

        return $prefix.$raw;
    }

    private function cleanHeadingText(?string $text): string
    {
        $source = is_string($text) ? $text : '';
        $stripped = preg_replace('/^\s*#{1,6}\s+/u', '', $source);

        return is_string($stripped) ? $stripped : $source;
    }

    /**
     * @param  array<int, array<string, mixed>>  $nodes
     * @param  array<string, bool>  $usedIds
     * @return array{0: array<int, array<string, mixed>>, 1: bool}
     */
    private function ensureLeadingHeading(array $nodes, ?string $title, array &$usedIds): array
    {
        $firstNode = $nodes[0] ?? null;
        if (is_array($firstNode) && ($firstNode['type'] ?? null) === 'heading') {
            $level = max(1, min(6, (int) Arr::get($firstNode, 'attrs.level', 1)));
            $existingId = Arr::get($firstNode, 'attrs.id');
            $normalizedExistingId = is_string($existingId) ? trim($existingId) : '';
            $firstNode['attrs']['level'] = 1;
            $firstNode['attrs']['id'] = $normalizedExistingId !== ''
                ? $normalizedExistingId
                : $this->ensureUniqueId(null, $usedIds);
            $firstNode['content'] = $this->normalizeInlineContent(
                Arr::get($firstNode, 'content', []),
                true,
            );
            $nodes[0] = $firstNode;

            return [$nodes, $level !== 1];
        }

        $fallbackTitle = $this->extractFirstParagraphText($nodes) ?? trim((string) $title);
        if ($fallbackTitle === '') {
            $fallbackTitle = 'Untitled';
        }
        $fallbackTitle = $this->cleanHeadingText($fallbackTitle);

        $headingNode = [
            'type' => 'heading',
            'attrs' => [
                'id' => $this->ensureUniqueId(null, $usedIds),
                'level' => 1,
            ],
            'content' => $fallbackTitle !== ''
                ? [['type' => 'text', 'text' => $fallbackTitle]]
                : [],
        ];

        if ($this->firstParagraphIsDuplicateTitle($nodes, $fallbackTitle)) {
            array_shift($nodes);
        }

        array_unshift($nodes, $headingNode);

        return [$nodes, true];
    }

    /**
     * @param  array<int, array<string, mixed>>  $nodes
     */
    private function extractFirstParagraphText(array $nodes): ?string
    {
        foreach ($nodes as $node) {
            if (($node['type'] ?? null) !== 'paragraph') {
                continue;
            }

            $text = '';
            foreach (Arr::get($node, 'content', []) as $child) {
                if (is_array($child) && (($child['type'] ?? null) === 'text')) {
                    $text .= (string) ($child['text'] ?? '');
                }
            }

            $trimmed = trim($this->cleanHeadingText($text));
            if ($trimmed !== '') {
                return $trimmed;
            }
        }

        return null;
    }

    /**
     * @param  array<int, array<string, mixed>>  $nodes
     */
    private function firstParagraphIsDuplicateTitle(array $nodes, string $title): bool
    {
        $firstNode = $nodes[0] ?? null;
        if (! is_array($firstNode) || ($firstNode['type'] ?? null) !== 'paragraph') {
            return false;
        }

        if ((string) Arr::get($firstNode, 'attrs.blockStyle', 'paragraph') !== 'paragraph') {
            return false;
        }

        $text = trim((string) $this->extractFirstParagraphText([$firstNode]));

        return $text !== '' && mb_strtolower($text) === mb_strtolower(trim($title));
    }

    /**
     * @param  array<string, bool>  $usedIds
     */
    private function ensureUniqueId(mixed $candidate, array &$usedIds): string
    {
        $normalized = is_string($candidate) ? trim($candidate) : '';

        if ($normalized !== '' && ! isset($usedIds[$normalized])) {
            $usedIds[$normalized] = true;

            return $normalized;
        }

        do {
            $generated = (string) Str::uuid();
        } while (isset($usedIds[$generated]));

        $usedIds[$generated] = true;

        return $generated;
    }

    /**
     * @param  array<string, mixed>  $document
     */
    private function documentHash(array $document): string
    {
        return md5((string) json_encode($document, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
}
