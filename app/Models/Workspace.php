<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use LogicException;

class Workspace extends Model
{
    use HasFactory, HasUuids;

    public const DEFAULT_COLOR = 'slate';

    public const DEFAULT_ICON = 'briefcase';

    public const EDITOR_MODE_LEGACY = 'legacy';

    public const EDITOR_MODE_BLOCK = 'block';

    public const EDITOR_MODES = [
        self::EDITOR_MODE_LEGACY,
        self::EDITOR_MODE_BLOCK,
    ];

    protected $fillable = [
        'owner_id',
        'is_personal',
        'name',
        'slug',
        'color',
        'timeblock_color',
        'editor_mode',
        'migrated_at',
        'icon',
        'storage_disk',
        'mention_suggestions',
        'hashtag_suggestions',
    ];

    protected static function booted(): void
    {
        static::saving(function (Workspace $workspace): void {
            $ownerId = $workspace->owner_id;
            if (! $ownerId) {
                return;
            }

            $isDemotingPersonalWorkspace =
                $workspace->exists
                && $workspace->isDirty('is_personal')
                && (bool) $workspace->getOriginal('is_personal') === true
                && (bool) $workspace->is_personal === false;

            if (! $isDemotingPersonalWorkspace) {
                return;
            }

            $ownerHasAnotherPersonalWorkspace = static::query()
                ->where('owner_id', $ownerId)
                ->where('id', '!=', $workspace->id)
                ->where('is_personal', true)
                ->exists();

            if (! $ownerHasAnotherPersonalWorkspace) {
                throw new LogicException('Each owner must always have one personal workspace.');
            }
        });

        static::creating(function (Workspace $workspace): void {
            $rawColor = $workspace->getAttributeFromArray('color');
            if (! is_string($rawColor) || trim($rawColor) === '') {
                $workspace->color = self::DEFAULT_COLOR;
            }
            $rawIcon = $workspace->getAttributeFromArray('icon');
            if (! is_string($rawIcon) || trim($rawIcon) === '') {
                $workspace->icon = self::DEFAULT_ICON;
            }
            $rawEditorMode = $workspace->getAttributeFromArray('editor_mode');
            if (! is_string($rawEditorMode) || ! in_array(trim($rawEditorMode), self::EDITOR_MODES, true)) {
                $workspace->editor_mode = self::EDITOR_MODE_LEGACY;
            }

            $workspace->slug = self::buildUniqueSlug(
                (string) ($workspace->name ?: 'workspace'),
            );
        });

        static::updating(function (Workspace $workspace): void {
            $rawColor = $workspace->getAttributeFromArray('color');
            if (! is_string($rawColor) || trim($rawColor) === '') {
                $workspace->color = self::DEFAULT_COLOR;
            }
            $rawIcon = $workspace->getAttributeFromArray('icon');
            if (! is_string($rawIcon) || trim($rawIcon) === '') {
                $workspace->icon = self::DEFAULT_ICON;
            }
            $rawEditorMode = $workspace->getAttributeFromArray('editor_mode');
            if (! is_string($rawEditorMode) || ! in_array(trim($rawEditorMode), self::EDITOR_MODES, true)) {
                $workspace->editor_mode = self::EDITOR_MODE_LEGACY;
            }

            if (! $workspace->isDirty('name') && filled($workspace->slug)) {
                return;
            }

            $workspace->slug = self::buildUniqueSlug(
                (string) ($workspace->name ?: 'workspace'),
                $workspace->id,
            );
        });

        static::saved(function (Workspace $workspace): void {
            if (! $workspace->is_personal || ! $workspace->owner_id) {
                return;
            }

            static::query()
                ->where('owner_id', $workspace->owner_id)
                ->where('id', '!=', $workspace->id)
                ->where('is_personal', true)
                ->update([
                    'is_personal' => false,
                    'updated_at' => now(),
                ]);
        });
    }

    private static function buildUniqueSlug(string $name, ?string $ignoreId = null): string
    {
        $base = Str::slug(trim($name));
        if ($base === '') {
            $base = 'workspace';
        }

        $candidate = $base;
        $suffix = 2;

        while (
            static::query()
                ->where('slug', $candidate)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $candidate = "{$base}-{$suffix}";
            $suffix++;
        }

        return $candidate;
    }

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

    protected function editorMode(): Attribute
    {
        return Attribute::make(
            get: fn (?string $value): string => ($value !== null && in_array(trim($value), self::EDITOR_MODES, true))
                ? trim($value)
                : self::EDITOR_MODE_LEGACY,
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
            'migrated_at' => 'datetime',
            'is_personal' => 'boolean',
        ];
    }

    public function isMigratedSource(): bool
    {
        return $this->migrated_at !== null;
    }

    public function isPersonal(): bool
    {
        return (bool) $this->is_personal;
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

    public function calendars(): HasMany
    {
        return $this->hasMany(Calendar::class);
    }

    public function calendarConnections(): HasMany
    {
        return $this->hasMany(CalendarConnection::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(NoteImage::class);
    }

    public function resolvedStorageDisk(): string
    {
        $defaultDisk = (string) config('note-images.default_disk', 'public');
        $allowedDisks = config('note-images.allowed_disks', [$defaultDisk]);
        if (! is_array($allowedDisks)) {
            $allowedDisks = [$defaultDisk];
        }

        $normalizedAllowedDisks = collect($allowedDisks)
            ->filter(fn ($disk) => is_string($disk) && trim($disk) !== '')
            ->map(fn (string $disk) => trim($disk))
            ->values()
            ->all();

        $configuredDisk = is_string($this->storage_disk) ? trim($this->storage_disk) : '';
        if ($configuredDisk !== '' && in_array($configuredDisk, $normalizedAllowedDisks, true)) {
            return $configuredDisk;
        }

        return $defaultDisk;
    }

    public function imageStorageDirectory(): string
    {
        $basePath = trim((string) config('note-images.folder', 'uploads/images'), '/');

        return "{$basePath}/workspaces/{$this->id}";
    }
}
