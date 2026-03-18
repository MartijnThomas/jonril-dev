<?php

namespace App\Support\Notes;

class NoteSearchExtractor
{
    /**
     * @param  array<int, string>  $taskTerms
     * @return array{
     *     content_text: string,
     *     heading_terms: array<int, string>,
     *     heading_block_ids: array<int, string>,
     *     heading_h1_terms: array<int, string>,
     *     heading_h2_terms: array<int, string>,
     *     heading_h3_terms: array<int, string>,
     *     heading_h4_terms: array<int, string>,
     *     heading_h5_terms: array<int, string>,
     *     heading_h6_terms: array<int, string>,
     *     mentions: array<int, string>,
     *     hashtags: array<int, string>,
     *     tags: array<int, string>,
     *     property_terms: array<int, string>,
     *     task_terms: array<int, string>
     * }
     */
    public function extract(mixed $content, mixed $properties = null, array $taskTerms = []): array
    {
        $mentions = [];
        $hashtags = [];
        $headingTerms = [];
        $headingBlockIdsByTerm = [];
        $headingTermsByLevel = [
            1 => [],
            2 => [],
            3 => [],
            4 => [],
            5 => [],
            6 => [],
        ];

        $doc = $this->normalizeDoc($content);
        $contentText = '';
        if (is_array($doc)) {
            $contentText = $this->normalizeText(
                $this->extractNodeText($doc, $mentions, $hashtags, $headingTerms, $headingTermsByLevel),
            );
        } elseif (is_string($content)) {
            $contentText = $this->normalizeText($content);
            $this->extractInlineSignalsFromText($contentText, $mentions, $hashtags);
        }

        if (is_array($doc)) {
            $this->collectHeadingBlockIds($doc, $headingBlockIdsByTerm);
        }

        $propertyExtraction = $this->extractPropertyTerms($properties);
        $headingTerms = $this->normalizeUniqueList($headingTerms);
        $headingBlockIds = collect($headingTerms)
            ->map(fn (string $term): string => (string) ($headingBlockIdsByTerm[$term] ?? ''))
            ->values()
            ->all();

        return [
            'content_text' => $contentText,
            'heading_terms' => $headingTerms,
            'heading_block_ids' => $headingBlockIds,
            'heading_h1_terms' => $this->normalizeUniqueList($headingTermsByLevel[1]),
            'heading_h2_terms' => $this->normalizeUniqueList($headingTermsByLevel[2]),
            'heading_h3_terms' => $this->normalizeUniqueList($headingTermsByLevel[3]),
            'heading_h4_terms' => $this->normalizeUniqueList($headingTermsByLevel[4]),
            'heading_h5_terms' => $this->normalizeUniqueList($headingTermsByLevel[5]),
            'heading_h6_terms' => $this->normalizeUniqueList($headingTermsByLevel[6]),
            'mentions' => $this->normalizeUniqueList($mentions),
            'hashtags' => $this->normalizeUniqueList($hashtags),
            'tags' => $propertyExtraction['tags'],
            'property_terms' => $propertyExtraction['property_terms'],
            'task_terms' => $this->normalizeUniqueList($taskTerms),
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
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     * @param  array<int, string>  $headingTerms
     * @param  array<int, array<int, string>>  $headingTermsByLevel
     */
    private function extractNodeText(
        array $node,
        array &$mentions,
        array &$hashtags,
        array &$headingTerms,
        array &$headingTermsByLevel,
    ): string {
        $type = (string) ($node['type'] ?? '');
        if ($type === 'text') {
            $text = (string) ($node['text'] ?? '');
            $this->extractInlineSignalsFromText($text, $mentions, $hashtags);

            return $text;
        }

        if ($type === 'mention') {
            $label = (string) ($node['attrs']['label'] ?? $node['attrs']['id'] ?? '');
            $normalized = $this->normalizeTokenLabel($label);
            if ($normalized !== '') {
                $mentions[] = $normalized;
            }

            return $label;
        }

        if ($type === 'hashtag') {
            $label = (string) ($node['attrs']['label'] ?? $node['attrs']['id'] ?? '');
            $normalized = $this->normalizeTokenLabel($label);
            if ($normalized !== '') {
                $hashtags[] = $normalized;
            }

            return $label;
        }

        if ($type === 'hardBreak') {
            return "\n";
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

            $parts[] = $this->extractNodeText(
                $child,
                $mentions,
                $hashtags,
                $headingTerms,
                $headingTermsByLevel,
            );
        }

        $combined = implode(' ', $parts);
        if ($type === 'heading') {
            $headingText = $this->normalizeHeadingText($combined);
            if ($headingText !== '') {
                $headingTerms[] = $headingText;
                $level = $this->normalizeHeadingLevel($node['attrs']['level'] ?? null);
                $headingTermsByLevel[$level][] = $headingText;
            }
        }

        return $combined;
    }

    /**
     * @param  array<int, string>  $headingBlockIdsByTerm
     */
    private function collectHeadingBlockIds(array $node, array &$headingBlockIdsByTerm): void
    {
        $type = (string) ($node['type'] ?? '');
        if ($type === 'heading') {
            $headingText = $this->normalizeHeadingText($this->nodeTextForHeadingId($node));
            if ($headingText !== '' && ! isset($headingBlockIdsByTerm[$headingText])) {
                $headingId = (string) ($node['attrs']['id'] ?? '');
                $headingBlockIdsByTerm[$headingText] = trim($headingId);
            }
        }

        $children = $node['content'] ?? null;
        if (! is_array($children)) {
            return;
        }

        foreach ($children as $child) {
            if (! is_array($child)) {
                continue;
            }

            $this->collectHeadingBlockIds($child, $headingBlockIdsByTerm);
        }
    }

    private function nodeTextForHeadingId(array $node): string
    {
        $type = (string) ($node['type'] ?? '');
        if ($type === 'text') {
            return (string) ($node['text'] ?? '');
        }
        if ($type === 'hardBreak') {
            return ' ';
        }

        $children = $node['content'] ?? null;
        if (! is_array($children)) {
            return '';
        }

        $parts = [];
        foreach ($children as $child) {
            if (! is_array($child)) {
                continue;
            }
            $parts[] = $this->nodeTextForHeadingId($child);
        }

        return implode(' ', $parts);
    }

    /**
     * @param  array<int, string>  $mentions
     * @param  array<int, string>  $hashtags
     */
    private function extractInlineSignalsFromText(string $text, array &$mentions, array &$hashtags): void
    {
        if ($text === '') {
            return;
        }

        if (preg_match_all('/(^|\s)@([\pL\pN._-]+)/u', $text, $mentionMatches)) {
            foreach ($mentionMatches[2] ?? [] as $mention) {
                if (! is_string($mention)) {
                    continue;
                }

                $normalized = $this->normalizeTokenLabel($mention);
                if ($normalized !== '') {
                    $mentions[] = $normalized;
                }
            }
        }

        if (preg_match_all('/(^|\s)#([\pL\pN._-]+)/u', $text, $hashtagMatches)) {
            foreach ($hashtagMatches[2] ?? [] as $hashtag) {
                if (! is_string($hashtag)) {
                    continue;
                }

                $normalized = $this->normalizeTokenLabel($hashtag);
                if ($normalized !== '') {
                    $hashtags[] = $normalized;
                }
            }
        }
    }

    private function normalizeHeadingText(string $text): string
    {
        $normalized = $this->normalizeText($text);
        $stripped = preg_replace('/^\s*#{1,6}\s+/u', '', $normalized);

        return is_string($stripped) ? $stripped : $normalized;
    }

    private function normalizeHeadingLevel(mixed $value): int
    {
        if (is_numeric($value)) {
            $numeric = (int) $value;

            return max(1, min(6, $numeric));
        }

        return 6;
    }

    private function normalizeTokenLabel(string $value): string
    {
        $normalized = mb_strtolower(trim($value));
        $normalized = ltrim($normalized, '@#');

        return $normalized;
    }

    private function normalizeText(string $text): string
    {
        $collapsed = preg_replace('/\s+/u', ' ', trim($text));

        return is_string($collapsed) ? $collapsed : '';
    }

    /**
     * @return array{
     *     tags: array<int, string>,
     *     property_terms: array<int, string>
     * }
     */
    private function extractPropertyTerms(mixed $properties): array
    {
        if (! is_array($properties)) {
            return [
                'tags' => [],
                'property_terms' => [],
            ];
        }

        $tags = [];
        $rawTags = $properties['tags'] ?? null;
        if (is_string($rawTags)) {
            $rawTags = explode(',', $rawTags);
        }
        if (is_array($rawTags)) {
            foreach ($rawTags as $tag) {
                if (! is_string($tag)) {
                    continue;
                }

                $normalized = $this->normalizeTokenLabel($tag);
                if ($normalized !== '') {
                    $tags[] = $normalized;
                }
            }
        }

        $propertyTerms = [];
        $walk = function (mixed $value, ?string $key = null) use (&$walk, &$propertyTerms): void {
            if (is_string($key) && trim($key) !== '') {
                $propertyTerms[] = mb_strtolower(trim($key));
            }

            if (is_array($value)) {
                foreach ($value as $childKey => $childValue) {
                    $walk($childValue, is_string($childKey) ? $childKey : null);
                }

                return;
            }

            if (is_string($value)) {
                $normalized = mb_strtolower(trim($value));
                if ($normalized !== '') {
                    $propertyTerms[] = $normalized;
                }
            }
        };

        foreach ($properties as $key => $value) {
            $walk($value, is_string($key) ? $key : null);
        }

        return [
            'tags' => $this->normalizeUniqueList($tags),
            'property_terms' => $this->normalizeUniqueList($propertyTerms),
        ];
    }

    /**
     * @param  array<int, string>  $values
     * @return array<int, string>
     */
    private function normalizeUniqueList(array $values): array
    {
        return collect($values)
            ->map(fn ($value) => is_string($value) ? trim($value) : '')
            ->filter(fn (string $value) => $value !== '')
            ->unique()
            ->values()
            ->all();
    }
}
