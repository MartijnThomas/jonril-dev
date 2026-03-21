<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Calendar extends Model
{
    use HasUuids;

    protected $fillable = [
        'workspace_id',
        'calendar_connection_id',
        'connection_id',
        'provider',
        'username',
        'password',
        'name',
        'url',
        'color',
        'sync_token',
        'last_synced_at',
        'is_active',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'last_synced_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Calendar $calendar): void {
            if (! $calendar->calendar_connection_id) {
                $calendar->calendar_connection_id = $calendar->resolveConnectionIdFromLegacyAttributes();
            }

            unset($calendar->provider, $calendar->username, $calendar->password, $calendar->connection_id);
        });
    }

    protected function resolveConnectionIdFromLegacyAttributes(): ?string
    {
        $workspaceId = (string) $this->workspace_id;
        if ($workspaceId === '') {
            return null;
        }

        $provider = strtolower(trim((string) $this->getAttribute('provider')));
        if ($provider === '') {
            $provider = 'caldav';
        }
        $username = trim((string) $this->getAttribute('username'));
        $password = (string) $this->getAttribute('password');
        $serverUrl = $this->normalizeBaseUrl((string) $this->url);

        $connection = CalendarConnection::query()
            ->where('workspace_id', $workspaceId)
            ->when($username !== '', fn ($query) => $query->where('username', $username))
            ->first();

        if (! $connection) {
            $connection = CalendarConnection::query()->create([
                'workspace_id' => $workspaceId,
                'provider' => $provider,
                'server_url' => $serverUrl,
                'username' => $username,
                'password' => $password,
            ]);
        } elseif ($password !== '' && $connection->password !== $password) {
            $connection->forceFill(['password' => $password])->save();
        }

        return $connection->id;
    }

    protected function normalizeBaseUrl(string $url): string
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

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function connection(): BelongsTo
    {
        return $this->belongsTo(CalendarConnection::class, 'calendar_connection_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(CalendarItem::class);
    }
}
