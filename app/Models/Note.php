<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;

class Note extends Model
{
    use HasFactory, HasUuids;

    protected function title(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value) => $this->propertyTitleOverride() ?? $value,
        );
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'content' => 'json',
            'properties' => 'array',
        ];
    }

    private function propertyTitleOverride(): ?string
    {
        if (! is_array($this->properties)) {
            return null;
        }

        $title = $this->properties['title'] ?? null;
        if (! is_string($title)) {
            return null;
        }

        $trimmed = trim($title);

        return $trimmed !== '' ? $trimmed : null;
    }
}
