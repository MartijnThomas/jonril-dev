<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendar_connections', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('provider')->default('caldav');
            $table->text('server_url');
            $table->string('username');
            $table->text('password');
            $table->timestamp('last_discovered_at')->nullable();
            $table->timestamps();

            $table->index(['workspace_id', 'provider', 'username']);
        });

        $connectionIdsByGroup = [];

        DB::table('calendars')
            ->select(['workspace_id', 'connection_id', 'provider', 'url', 'username', 'password'])
            ->orderBy('workspace_id')
            ->orderBy('id')
            ->get()
            ->each(function (object $row) use (&$connectionIdsByGroup): void {
                $workspaceId = (string) $row->workspace_id;
                $provider = strtolower(trim((string) $row->provider));
                $username = strtolower(trim((string) $row->username));
                $serverUrl = $this->normalizeBaseUrl((string) $row->url);
                $legacyConnectionId = is_string($row->connection_id) && trim($row->connection_id) !== ''
                    ? trim($row->connection_id)
                    : null;

                $groupKey = $workspaceId.'|'.($legacyConnectionId ?? sha1("{$provider}|{$username}|{$serverUrl}"));

                if (! isset($connectionIdsByGroup[$groupKey])) {
                    $connectionId = (string) Str::uuid();

                    DB::table('calendar_connections')->insert([
                        'id' => $connectionId,
                        'workspace_id' => $workspaceId,
                        'provider' => $provider !== '' ? $provider : 'caldav',
                        'server_url' => $serverUrl,
                        'username' => (string) $row->username,
                        'password' => (string) $row->password,
                        'last_discovered_at' => null,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    $connectionIdsByGroup[$groupKey] = $connectionId;
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_connections');
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
