<?php

namespace App\Support\Notes;

use Illuminate\Support\Arr;

class NoteMetaExtractor
{
    /**
     * @return array{
     *     navigation: array<int, array{
     *         type: 'heading',
     *         html_id: string,
     *         level: int|null,
     *         text: string
     *     }>
     * }
     */
    public function extract(mixed $content): array
    {
        $doc = $this->normalizeDoc($content);
        if (! is_array($doc)) {
            return ['navigation' => []];
        }

        $entries = [];
        $this->walkNodes(
            Arr::get($doc, 'content', []),
            function (array $node) use (&$entries): void {
                $type = (string) ($node['type'] ?? '');
                $attrs = Arr::get($node, 'attrs', []);
                $htmlId = trim((string) ($attrs['id'] ?? ''));

                if ($htmlId === '') {
                    return;
                }

                if ($type === 'heading') {
                    $level = is_numeric($attrs['level'] ?? null)
                        ? max(1, min(6, (int) $attrs['level']))
                        : null;
                    $text = $this->normalizeText(
                        $this->stripHeadingPrefix($this->collectNodeText($node)),
                    );

                    if ($text === '') {
                        return;
                    }

                    $entries[] = [
                        'type' => 'heading',
                        'html_id' => $htmlId,
                        'level' => $level,
                        'text' => $text,
                    ];

                    return;
                }
            },
        );

        return [
            'navigation' => $entries,
        ];
    }

    private function normalizeDoc(mixed $content): mixed
    {
        if (is_array($content)) {
            return $content;
        }

        if (! is_string($content) || trim($content) === '') {
            return null;
        }

        $decoded = json_decode($content, true);

        if (json_last_error() !== JSON_ERROR_NONE || ! is_array($decoded)) {
            return null;
        }

        return $decoded;
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

            $onNode($node);

            $children = Arr::get($node, 'content', []);
            if (is_array($children)) {
                $this->walkNodes($children, $onNode);
            }
        }
    }

    /**
     * @param  array<string, mixed>  $node
     */
    private function collectNodeText(array $node): string
    {
        $type = $node['type'] ?? null;
        if ($type === 'text') {
            return (string) ($node['text'] ?? '');
        }

        if ($type === 'mention') {
            return (string) ($node['attrs']['label'] ?? $node['attrs']['id'] ?? '');
        }

        if ($type === 'hashtag') {
            return '';
        }

        $content = $node['content'] ?? null;
        if (! is_array($content)) {
            return '';
        }

        $parts = [];
        foreach ($content as $child) {
            if (! is_array($child)) {
                continue;
            }

            if (($child['type'] ?? null) === 'hardBreak') {
                $parts[] = "\n";

                continue;
            }

            $parts[] = $this->collectNodeText($child);
        }

        return implode(' ', $parts);
    }

    private function normalizeText(string $text): string
    {
        $withoutInlineHashtags = preg_replace('/(^|\s)#[\pL\pN_-]+/u', '$1', $text);
        if ($withoutInlineHashtags === null) {
            return '';
        }

        $normalized = preg_replace('/\s+/u', ' ', trim($withoutInlineHashtags));
        if ($normalized === null) {
            return '';
        }

        return $normalized;
    }

    private function stripHeadingPrefix(string $text): string
    {
        $cleaned = preg_replace('/^\s*#{1,6}\s+/u', '', $text);

        return is_string($cleaned) ? $cleaned : $text;
    }
}
