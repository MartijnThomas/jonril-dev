<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, TwoFactorAuthenticatable;

    public const LONG_DATE_FORMAT_OPTIONS = [
        'weekday_day_month_year',
        'weekday_month_day_year',
        'day_month_year',
        'iso_date',
    ];

    public const SHORT_DATE_FORMAT_OPTIONS = [
        'weekday_day_month_short_year',
        'day_month_short_year',
        'numeric_day_month_year',
        'iso_date',
    ];

    public const TIME_FORMAT_OPTIONS = [
        '24h',
        '12h',
    ];

    public const DEFAULT_TIMEZONE_BY_LANGUAGE = [
        'nl' => 'Europe/Amsterdam',
        'en' => 'America/New_York',
    ];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'role',
        'password',
        'settings',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'remember_token',
    ];

    protected static function booted(): void
    {
        static::created(function (self $user): void {
            if ($user->workspaces()->exists()) {
                return;
            }

            $workspace = Workspace::query()->create([
                'owner_id' => $user->id,
                'name' => trim("{$user->name} Workspace"),
            ]);

            $user->workspaces()->attach($workspace->id, [
                'role' => 'owner',
            ]);

            $settings = is_array($user->settings) ? $user->settings : [];
            $settings['workspace_id'] = $workspace->id;

            $user->forceFill([
                'settings' => $settings,
            ])->saveQuietly();
        });
    }

    public function ownedWorkspaces(): HasMany
    {
        return $this->hasMany(Workspace::class, 'owner_id');
    }

    public function workspaces(): BelongsToMany
    {
        return $this->belongsToMany(Workspace::class, 'workspace_user')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function notes(): HasMany
    {
        $workspace = $this->currentWorkspace();
        if (! $workspace) {
            throw new \RuntimeException('No workspace available for notes relation.');
        }

        return $workspace->notes();
    }

    public function currentWorkspace(): ?Workspace
    {
        $preferredWorkspaceId = data_get($this->settings, 'workspace_id');
        if (is_string($preferredWorkspaceId)) {
            $preferred = $this->workspaces()->where('workspaces.id', $preferredWorkspaceId)->first();
            if ($preferred) {
                return $preferred;
            }
        }

        return $this->workspaces()
            ->orderByRaw("case when workspace_user.role = 'owner' then 0 else 1 end")
            ->orderBy('workspaces.created_at')
            ->first();
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'settings' => 'array',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    public function noteRevisionAutosaveIntervalMinutes(): int
    {
        $default = (int) config('note-revisions.autosave.default_interval_minutes', 15);
        $min = (int) config('note-revisions.autosave.min_interval_minutes', 5);
        $max = (int) config('note-revisions.autosave.max_interval_minutes', 60);

        $value = data_get($this->settings, 'notes.revision_autosave_interval_minutes');
        if (! is_numeric($value)) {
            return $default;
        }

        $interval = (int) $value;

        return max($min, min($max, $interval));
    }

    public function defaultTimeblockDurationMinutes(): int
    {
        $default = 60;
        $min = 5;
        $max = 12 * 60;

        $value = data_get($this->settings, 'editor.timeblock_default_duration_minutes');
        if (! is_numeric($value)) {
            return $default;
        }

        $duration = (int) $value;

        return max($min, min($max, $duration));
    }

    public function languagePreference(): string
    {
        $language = strtolower((string) data_get($this->settings, 'language', 'nl'));

        return in_array($language, ['nl', 'en'], true) ? $language : 'nl';
    }

    public function longDateFormatPreference(): string
    {
        $value = strtolower((string) data_get($this->settings, 'date_long_format', ''));
        if (in_array($value, self::LONG_DATE_FORMAT_OPTIONS, true)) {
            return $value;
        }

        return $this->languagePreference() === 'en'
            ? 'weekday_day_month_year'
            : 'weekday_day_month_year';
    }

    public function shortDateFormatPreference(): string
    {
        $value = strtolower((string) data_get($this->settings, 'date_short_format', ''));
        if (in_array($value, self::SHORT_DATE_FORMAT_OPTIONS, true)) {
            return $value;
        }

        return 'weekday_day_month_short_year';
    }

    public function timeFormatPreference(): string
    {
        $value = strtolower((string) data_get($this->settings, 'time_format', ''));
        if (in_array($value, self::TIME_FORMAT_OPTIONS, true)) {
            return $value;
        }

        return $this->languagePreference() === 'en' ? '12h' : '24h';
    }

    public function timezonePreference(): string
    {
        $value = trim((string) data_get($this->settings, 'timezone', ''));
        if ($value !== '' && in_array($value, timezone_identifiers_list(), true)) {
            return $value;
        }

        return self::DEFAULT_TIMEZONE_BY_LANGUAGE[$this->languagePreference()] ?? 'UTC';
    }
}
