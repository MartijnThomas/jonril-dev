<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Workspace extends Model
{
    use HasFactory, HasUuids;

    public const DEFAULT_COLOR = 'slate';

    public const DEFAULT_ICON = 'briefcase';

    protected $fillable = [
        'owner_id',
        'name',
        'color',
        'icon',
        'mention_suggestions',
        'hashtag_suggestions',
    ];

    protected function color(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): string => ($value !== null && trim($value) !== '')
                ? trim($value)
                : self::DEFAULT_COLOR,
        );
    }

    protected function icon(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): string => ($value !== null && trim($value) !== '')
                ? trim($value)
                : self::DEFAULT_ICON,
        );
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'mention_suggestions' => 'array',
            'hashtag_suggestions' => 'array',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'workspace_user')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function notes(): HasMany
    {
        return $this->hasMany(Note::class);
    }
}
