<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Note extends Model
{
    use HasFactory, HasUuids;

    public const TYPE_NOTE = 'note';

    public const TYPE_JOURNAL = 'journal';

    public const JOURNAL_DAILY = 'daily';

    public const JOURNAL_WEEKLY = 'weekly';

    public const JOURNAL_MONTHLY = 'monthly';

    public const JOURNAL_YEARLY = 'yearly';

    protected function title(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value) => $this->propertyTitleOverride() ?? $value,
        );
    }

    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function revisions(): HasMany
    {
        return $this->hasMany(NoteRevision::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(NoteTask::class);
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
            'journal_date' => 'date',
            'word_count' => 'integer',
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
