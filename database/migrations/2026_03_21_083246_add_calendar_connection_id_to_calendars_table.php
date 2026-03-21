<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('calendars', function (Blueprint $table) {
            $table->foreignUuid('calendar_connection_id')
                ->nullable()
                ->after('workspace_id')
                ->constrained('calendar_connections')
                ->nullOnDelete();
            $table->index(['workspace_id', 'calendar_connection_id']);
        });

        $connectionsByLegacyKey = [];

        DB::table('calendar_connections')
            ->select(['id', 'workspace_id', 'provider', 'server_url', 'username'])
            ->orderBy('workspace_id')
            ->get()
            ->each(function (object $connection) use (&$connectionsByLegacyKey): void {
                $workspaceId = (string) $connection->workspace_id;
                $provider = strtolower(trim((string) $connection->provider));
                $username = strtolower(trim((string) $connection->username));
                $serverUrl = trim((string) $connection->server_url);
                $legacyKey = $workspaceId.'|'.sha1("{$provider}|{$username}|{$serverUrl}");

                $connectionsByLegacyKey[$legacyKey] = (string) $connection->id;
            });

        DB::table('calendars')
            ->select(['id', 'workspace_id', 'connection_id', 'provider', 'url', 'username'])
            ->orderBy('id')
            ->get()
            ->each(function (object $calendar) use ($connectionsByLegacyKey): void {
                $workspaceId = (string) $calendar->workspace_id;
                $provider = strtolower(trim((string) $calendar->provider));
                $username = strtolower(trim((string) $calendar->username));
                $serverUrl = $this->normalizeBaseUrl((string) $calendar->url);
                $legacyConnectionId = is_string($calendar->connection_id) && trim($calendar->connection_id) !== ''
                    ? trim($calendar->connection_id)
                    : null;

                $connectionId = null;
                if ($legacyConnectionId !== null) {
                    $connectionId = DB::table('calendar_connections')
                        ->where('workspace_id', $workspaceId)
                        ->where('id', $legacyConnectionId)
                        ->value('id');
                }

                if (! is_string($connectionId) || trim($connectionId) === '') {
                    $legacyKey = $workspaceId.'|'.sha1("{$provider}|{$username}|{$serverUrl}");
                    $connectionId = $connectionsByLegacyKey[$legacyKey] ?? null;
                }

                if (! is_string($connectionId) || trim($connectionId) === '') {
                    $connectionId = DB::table('calendar_connections')
                        ->where('workspace_id', $workspaceId)
                        ->where('provider', $provider !== '' ? $provider : 'caldav')
                        ->where('username', (string) $calendar->username)
                        ->value('id');
                }

                if (is_string($connectionId) && trim($connectionId) !== '') {
                    DB::table('calendars')
                        ->where('id', $calendar->id)
                        ->update(['calendar_connection_id' => $connectionId]);
                }
            });
    }

    public function down(): void
    {
        Schema::table('calendars', function (Blueprint $table) {
            $table->dropIndex(['workspace_id', 'calendar_connection_id']);
            $table->dropConstrainedForeignId('calendar_connection_id');
        });
    }

    private function normalizeBaseUrl(string $url): string
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
};
