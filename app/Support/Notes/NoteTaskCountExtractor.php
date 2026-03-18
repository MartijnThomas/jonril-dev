<?php

namespace App\Support\Notes;

class NoteTaskCountExtractor
{
    /**
     * Count tasks in a TipTap document by status.
     *
     * @return array{total: int, open: int, completed: int, canceled: int, migrated: int, in_progress: int, backlog: int, assigned: int, deferred: int, starred: int}
     */
    public function count(mixed $content): array
    {
        $counts = [
            'total' => 0,
            'open' => 0,
            'completed' => 0,
            'canceled' => 0,
            'migrated' => 0,
            'in_progress' => 0,
            'backlog' => 0,
            'assigned' => 0,
            'deferred' => 0,
            'starred' => 0,
        ];

        $doc = $this->normalizeDoc($content);

        if (! is_array($doc)) {
            return $counts;
        }

        $this->traverseNode($doc, $counts);

        return $counts;
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
     * @param  array<string, int>  $counts
     */
    private function traverseNode(array $node, array &$counts): void
    {
        $type = $node['type'] ?? null;
        $attrs = is_array($node['attrs'] ?? null) ? $node['attrs'] : [];

        $isBlockTask = $type === 'paragraph' && ($attrs['blockStyle'] ?? null) === 'task';
        $isLegacyTask = $type === 'taskItem';

        if ($isBlockTask || $isLegacyTask) {
            $counts['total']++;
            $status = (string) ($attrs['taskStatus'] ?? '');
            $checked = (bool) ($attrs['checked'] ?? false);

            match (true) {
                $status === 'canceled' => $counts['canceled']++,
                $status === 'migrated' => $counts['migrated']++,
                $checked => $counts['completed']++,
                $status === 'in_progress' => $counts['in_progress']++,
                $status === 'backlog' => $counts['backlog']++,
                $status === 'assigned' => $counts['assigned']++,
                $status === 'deferred' => $counts['deferred']++,
                $status === 'starred' => $counts['starred']++,
                default => $counts['open']++,
            };
        }

        foreach ($node['content'] ?? [] as $child) {
            if (is_array($child)) {
                $this->traverseNode($child, $counts);
            }
        }
    }
}
