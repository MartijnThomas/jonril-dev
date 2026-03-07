<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\TwoFactorAuthenticatable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, TwoFactorAuthenticatable;

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

    public function notes()
    {
        return $this->hasMany(Note::class, 'user_id');
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
}
