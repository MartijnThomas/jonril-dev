<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Note extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    public const TYPE_NOTE = 'note';

    public const TYPE_JOURNAL = 'journal';

    public const TYPE_MEETING = 'meeting';

    public const JOURNAL_DAILY = 'daily';

    public const JOURNAL_WEEKLY = 'weekly';

    public const JOURNAL_MONTHLY = 'monthly';

    public const JOURNAL_YEARLY = 'yearly';

    public const JOURNAL_ICON_DEFAULTS = [
        self::JOURNAL_DAILY => 'calendar',
        self::JOURNAL_WEEKLY => 'calendar',
        self::JOURNAL_MONTHLY => 'calendar_days',
        self::JOURNAL_YEARLY => 'calendar',
    ];

    public const JOURNAL_ICON_COLOR_DEFAULT = 'default';

    protected function title(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value) => $this->propertyTitleOverride() ?? $value,
        );
    }

    protected function displayTitle(): Attribute
    {
        return Attribute::make(
            get: fn (): string => $this->normalizedDisplayTitle(),
        );
    }

    protected function icon(): Attribute
    {
        return Attribute::make(
            get: fn (): ?string => $this->propertyStringValue('icon')
                ?? ($this->type === self::TYPE_JOURNAL
                    ? (self::JOURNAL_ICON_DEFAULTS[$this->journal_granularity ?: self::JOURNAL_DAILY]
                        ?? self::JOURNAL_ICON_DEFAULTS[self::JOURNAL_DAILY])
                    : null),
        );
    }

    protected function iconColor(): Attribute
    {
        return Attribute::make(
            get: fn (): ?string => $this->propertyStringValue('icon-color')
                ?? ($this->type === self::TYPE_JOURNAL
                    ? self::JOURNAL_ICON_COLOR_DEFAULT
                    : null),
        );
    }

    protected function iconBg(): Attribute
    {
        return Attribute::make(
            get: fn (): ?string => $this->propertyStringValue('icon-bg'),
        );
    }

    protected function path(): Attribute
    {
        return Attribute::make(
            get: fn (): string => $this->buildPath(),
        );
    }

    protected function context(): Attribute
    {
        return Attribute::make(
            get: fn (): ?string => $this->propertyStringValue('context'),
        );
    }

    protected function tags(): Attribute
    {
        return Attribute::make(
            get: fn (): array => $this->normalizedTags(),
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

    public function events(): HasMany
    {
        return $this->hasMany(Event::class);
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
            'meta' => 'array',
            'journal_date' => 'date',
        ];
    }

    public function wordCount(): Attribute
    {
        return Attribute::make(
            get: fn () => isset($this->meta['word_count']) ? (int) $this->meta['word_count'] : null,
        );
    }

    public function taskCounts(): Attribute
    {
        return Attribute::make(
            get: fn () => is_array($this->meta['task_counts'] ?? null) ? $this->meta['task_counts'] : null,
        );
    }

    private function propertyTitleOverride(): ?string
    {
        return $this->propertyStringValue('title');
    }

    private function propertyStringValue(string $key): ?string
    {
        if (! is_array($this->properties)) {
            return null;
        }

        $value = $this->properties[$key] ?? null;
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed !== '' ? $trimmed : null;
    }

    private function buildPath(): string
    {
        $segments = [];
        $visited = [];
        $cursor = $this;

        while ($cursor instanceof self) {
            if ($cursor->id !== null && isset($visited[$cursor->id])) {
                break;
            }
            if ($cursor->id !== null) {
                $visited[$cursor->id] = true;
            }

            $segments[] = $cursor->normalizedDisplayTitle();

            if (! $cursor->parent_id) {
                break;
            }

            if ($cursor->relationLoaded('parent')) {
                $cursor = $cursor->parent;

                continue;
            }

            $cursor = self::query()
                ->select(['id', 'parent_id', 'title', 'properties'])
                ->where('id', $cursor->parent_id)
                ->first();
        }

        return implode(' / ', array_reverse($segments));
    }

    private function normalizedDisplayTitle(): string
    {
        $title = $this->title;
        if (! is_string($title)) {
            return 'Untitled';
        }

        $trimmed = trim($title);

        return $trimmed !== '' ? $trimmed : 'Untitled';
    }

    /**
     * @return array<int, string>
     */
    private function normalizedTags(): array
    {
        if (! is_array($this->properties)) {
            return [];
        }

        $value = $this->properties['tags'] ?? null;
        if (is_string($value)) {
            $value = explode(',', $value);
        }
        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->map(fn ($item) => is_string($item) ? trim($item) : '')
            ->filter(fn (string $item) => $item !== '')
            ->map(fn (string $item) => ltrim($item, '#'))
            ->filter(fn (string $item) => $item !== '')
            ->values()
            ->all();
    }
}
