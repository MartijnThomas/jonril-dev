<?php

namespace App\Models;

use App\Support\Notes\JournalNoteService;
use App\Support\Notes\NoteSearchExtractor;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;
use Laravel\Scout\Searchable;

class Note extends Model
{
    use HasFactory, HasUuids, Searchable, SoftDeletes;

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

    public function images(): HasMany
    {
        return $this->hasMany(NoteImage::class);
    }

    public function searchableAs(): string
    {
        return 'notes';
    }

    /**
     * @return array<string, mixed>
     */
    public function toSearchableArray(): array
    {
        $pathSegments = $this->pathSegments();
        array_pop($pathSegments);
        $extracted = app(NoteSearchExtractor::class)->extract($this->content, $this->properties);
        $headings = $extracted['heading_terms'] ?? [];
        $headingsWithLevel = collect($headings)
            ->map(function ($heading) use ($extracted): string {
                $term = is_string($heading) ? $heading : '';

                return str_repeat('#', $this->headingLevelForTerm($term, $extracted)).' '.$term;
            })
            ->values()
            ->all();

        return [
            'id' => $this->id,
            'title' => $this->display_title,
            'workspace_slug' => $this->searchWorkspaceSlug(),
            'href' => $this->searchHref(),
            'path' => $this->path,
            'path_titles' => implode(' / ', $pathSegments),
            'journal_path_nl' => $this->journalSearchPath('nl'),
            'journal_path_en' => $this->journalSearchPath('en'),
            'journal_period' => $this->searchJournalPeriod(),
            'headings' => $headings,
            'headings_with_level' => $headingsWithLevel,
            'heading_block_ids' => $extracted['heading_block_ids'] ?? [],
            'content_text' => $extracted['content_text'] ?? '',
            'mentions' => $extracted['mentions'] ?? [],
            'hashtags' => $extracted['hashtags'] ?? [],
            'tags' => $extracted['tags'] ?? [],
            'property_terms' => $extracted['property_terms'] ?? [],
            'task_terms' => $extracted['task_terms'] ?? [],
            'icon' => $this->icon,
            'icon_color' => $this->icon_color,
            'icon_bg' => $this->icon_bg,
            'workspace_id' => $this->workspace_id,
            'type' => $this->type,
            'journal_granularity' => $this->journal_granularity,
            'journal_date' => $this->journal_date?->toDateString(),
        ];
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
        return implode(' / ', $this->pathSegments());
    }

    /**
     * @return array<int, string>
     */
    private function pathSegments(): array
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

        return array_reverse($segments);
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

    private function searchWorkspaceSlug(): string
    {
        $loadedSlug = $this->workspace?->slug;
        if (is_string($loadedSlug) && trim($loadedSlug) !== '') {
            return trim($loadedSlug);
        }

        $workspace = Workspace::query()
            ->where('id', $this->workspace_id)
            ->select(['id', 'slug'])
            ->first();

        return is_string($workspace?->slug) && trim($workspace->slug) !== ''
            ? trim($workspace->slug)
            : 'workspace';
    }

    private function searchHref(): string
    {
        $workspaceSlug = $this->searchWorkspaceSlug();
        if (
            $this->type === self::TYPE_JOURNAL
            && is_string($this->journal_granularity)
            && $this->journal_granularity !== ''
            && $this->journal_date !== null
        ) {
            $period = $this->searchJournalPeriod();
            if (is_string($period) && $period !== '') {
                return "/journal/{$period}";
            }
        }

        return "/w/{$workspaceSlug}/notes/{$this->id}";
    }

    private function searchJournalPeriod(): ?string
    {
        if (
            $this->type !== self::TYPE_JOURNAL
            || ! is_string($this->journal_granularity)
            || $this->journal_granularity === ''
            || $this->journal_date === null
        ) {
            return null;
        }

        return app(JournalNoteService::class)->periodFor(
            $this->journal_granularity,
            $this->journal_date,
        );
    }

    /**
     * @param  array<string, mixed>  $extracted
     */
    private function headingLevelForTerm(string $term, array $extracted): int
    {
        if ($term === '') {
            return 3;
        }

        for ($level = 1; $level <= 6; $level++) {
            $bucket = $extracted["heading_h{$level}_terms"] ?? [];
            if (! is_array($bucket)) {
                continue;
            }

            if (in_array($term, $bucket, true)) {
                return $level;
            }
        }

        return 3;
    }

    public function journalSearchPath(?string $locale = null): ?string
    {
        if ($this->type !== self::TYPE_JOURNAL || ! $this->journal_date) {
            return null;
        }

        $resolvedLocale = is_string($locale) && trim($locale) !== ''
            ? trim($locale)
            : (string) config('app.locale');

        $date = $this->journal_date->copy()->locale($resolvedLocale);
        $year = $date->format('Y');
        $month = Str::ucfirst($date->isoFormat('MMMM'));
        $week = 'Week '.$date->isoWeek();
        $granularity = is_string($this->journal_granularity) ? $this->journal_granularity : self::JOURNAL_DAILY;

        return match ($granularity) {
            self::JOURNAL_YEARLY => $year,
            self::JOURNAL_MONTHLY => "{$year} > {$month}",
            self::JOURNAL_WEEKLY => "{$year} > {$week}",
            default => "{$year} > {$month} > {$week}",
        };
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
