<?php

namespace App\Support\Telescope;

use Laravel\Telescope\IncomingEntry;

class PageVisitTagger
{
    /**
     * @return array<int, string>
     */
    public static function tagsFor(IncomingEntry $entry): array
    {
        if (! self::isTrackedPageVisit($entry)) {
            return [];
        }

        $path = self::pathFromUri((string) data_get($entry->content, 'uri', '/'));

        if (preg_match('#^/notes/[^/]+$#', $path) === 1) {
            return ['page-visit', 'page:note-show'];
        }

        if (preg_match('#^/(w/[^/]+/)?journal/[^/]+(?:/[^/]+)?$#', $path) === 1) {
            return ['page-visit', 'page:journal-show'];
        }

        if (str_starts_with($path, '/settings/')) {
            return ['page-visit', 'page:settings'];
        }

        return ['page-visit'];
    }

    public static function shouldRecordInProduction(IncomingEntry $entry): bool
    {
        return self::isTrackedPageVisit($entry);
    }

    private static function isTrackedPageVisit(IncomingEntry $entry): bool
    {
        if (! $entry->isRequest()) {
            return false;
        }

        if (self::isInertiaPartialRequest($entry)) {
            return false;
        }

        $method = strtoupper((string) data_get($entry->content, 'method', ''));
        if ($method !== 'GET') {
            return false;
        }

        $path = self::pathFromUri((string) data_get($entry->content, 'uri', '/'));

        if (preg_match('#^/notes/[^/]+$#', $path) === 1) {
            return true;
        }

        if (preg_match('#^/(w/[^/]+/)?journal/[^/]+(?:/[^/]+)?$#', $path) === 1) {
            return true;
        }

        if (! str_starts_with($path, '/settings/')) {
            return false;
        }

        return preg_match(
            '#^/settings/(profile|password|appearance|editor-preferences|task-filters|two-factor|admin/operations|admin/maintenance|workspaces/[^/]+)$#',
            $path,
        ) === 1;
    }

    private static function isInertiaPartialRequest(IncomingEntry $entry): bool
    {
        $xInertia = trim((string) data_get($entry->content, 'headers.x-inertia.0', ''));
        if ($xInertia === '') {
            return false;
        }

        $partialData = trim((string) data_get($entry->content, 'headers.x-inertia-partial-data.0', ''));

        return $partialData !== '';
    }

    private static function pathFromUri(string $uri): string
    {
        $path = parse_url($uri, PHP_URL_PATH);

        if (! is_string($path) || $path === '') {
            return '/';
        }

        return str_starts_with($path, '/') ? $path : "/{$path}";
    }
}
