<?php

namespace App\Support\Notes;

class NoteTitleExtractor
{
    public function extract(mixed $content): ?string
    {
        $doc = $this->normalizeDoc($content);

        if (! is_array($doc)) {
            return $this->normalizeLine($this->firstLineFromString((string) $content));
        }

        $headingTitle = $this->findFirstHeadingLevelOne($doc);
        if ($headingTitle !== null) {
            return $headingTitle;
        }

        $firstLine = $this->findFirstLine($doc);

        return $this->normalizeLine($firstLine);
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

    private function findFirstHeadingLevelOne(array $doc): ?string
    {
        foreach ($this->walkNodes($doc) as $node) {
            if (($node['type'] ?? null) !== 'heading') {
                continue;
            }

            $level = (int) ($node['attrs']['level'] ?? 0);
            if ($level !== 1) {
                continue;
            }

            $text = $this->normalizeLine($this->extractNodeText($node));
            if ($text !== null) {
                return $text;
            }
        }

        return null;
    }

    private function findFirstLine(array $doc): ?string
    {
        foreach ($this->walkNodes($doc) as $node) {
            $text = $this->extractNodeText($node);
            if ($text === '') {
                continue;
            }

            $line = $this->firstLineFromString($text);
            if ($line !== null) {
                return $line;
            }
        }

        return null;
    }

    private function extractNodeText(array $node): string
    {
        $type = $node['type'] ?? null;
        if ($type === 'text') {
            return (string) ($node['text'] ?? '');
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

            $childType = $child['type'] ?? null;
            if ($childType === 'hardBreak') {
                $parts[] = "\n";

                continue;
            }

            $parts[] = $this->extractNodeText($child);
        }

        return implode('', $parts);
    }

    private function walkNodes(array $root): \Generator
    {
        $stack = [$root];

        while ($stack !== []) {
            $node = array_pop($stack);
            if (! is_array($node)) {
                continue;
            }

            yield $node;

            $children = $node['content'] ?? null;
            if (! is_array($children)) {
                continue;
            }

            for ($i = count($children) - 1; $i >= 0; $i--) {
                $stack[] = $children[$i];
            }
        }
    }

    private function firstLineFromString(string $text): ?string
    {
        if (trim($text) === '') {
            return null;
        }

        $plain = strip_tags($text);
        $lines = preg_split('/\R/u', $plain);
        if ($lines === false) {
            return null;
        }

        foreach ($lines as $line) {
            if (trim($line) !== '') {
                return $line;
            }
        }

        return null;
    }

    private function normalizeLine(?string $line): ?string
    {
        if ($line === null) {
            return null;
        }

        $withoutHeadingPrefix = preg_replace('/^\s*#{1,6}\s+/u', '', $line);
        if ($withoutHeadingPrefix === null) {
            return null;
        }

        $normalized = preg_replace('/\s+/u', ' ', trim($withoutHeadingPrefix));
        if ($normalized === null || $normalized === '') {
            return null;
        }

        return $normalized;
    }
}
