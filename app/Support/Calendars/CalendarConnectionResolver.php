<?php

namespace App\Support\Calendars;

use App\Models\Calendar;

class CalendarConnectionResolver
{
    public function keyFor(Calendar $calendar): string
    {
        $provider = strtolower(trim((string) ($calendar->connection?->provider ?? 'caldav')));
        $username = strtolower(trim((string) ($calendar->connection?->username ?? '')));
        $baseUrl = $this->normalizeBaseUrl((string) $calendar->url);

        return sha1("{$provider}|{$username}|{$baseUrl}");
    }

    public function normalizeBaseUrl(string $url): string
    {
        $parts = parse_url(trim($url));
        if (! is_array($parts)) {
            return trim($url);
        }

        $scheme = strtolower((string) ($parts['scheme'] ?? 'https'));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $port = isset($parts['port']) ? ':'.$parts['port'] : '';
        $path = (string) ($parts['path'] ?? '/');

        $normalizedPath = preg_replace('#/+#', '/', $path) ?? '/';
        $normalizedPath = rtrim($normalizedPath, '/');
        if ($normalizedPath === '') {
            $normalizedPath = '/';
        }

        if ($normalizedPath !== '/') {
            $segments = explode('/', ltrim($normalizedPath, '/'));
            if (count($segments) > 1) {
                array_pop($segments);
                $normalizedPath = '/'.implode('/', $segments);
            }
        }

        return "{$scheme}://{$host}{$port}{$normalizedPath}";
    }
}
