<?php

namespace App\Support\Notes;

class NoteWordCountExtractor
{
    public function count(mixed $content): int
    {
        $doc = $this->normalizeDoc($content);

        if (! is_array($doc)) {
            return $this->countWordsFromText((string) $content);
        }

        return $this->countWordsFromText($this->extractNodeText($doc));
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

    private function extractNodeText(array $node): string
    {
        $type = $node['type'] ?? null;

        if ($type === 'text') {
            return (string) ($node['text'] ?? '');
        }

        if ($type === 'mention' || $type === 'hashtag') {
            $label = (string) ($node['attrs']['label'] ?? $node['attrs']['id'] ?? '');

            return $label !== '' ? $label : '';
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

            $parts[] = $this->extractNodeText($child);
        }

        return implode(' ', $parts);
    }

    private function countWordsFromText(string $text): int
    {
        $normalized = trim(strip_tags($text));
        if ($normalized === '') {
            return 0;
        }

        $parts = preg_split('/\s+/u', $normalized);
        if ($parts === false) {
            return 0;
        }

        return count(array_filter($parts, fn ($part) => $part !== ''));
    }
}

