<?php

namespace App\Support\Workspaces;

use App\Models\Workspace;
use Illuminate\Validation\ValidationException;

class WorkspaceSuggestionStore
{
    /**
     * @return array<int, string>
     */
    public function add(Workspace $workspace, string $kind, string $value): array
    {
        $normalizedKind = $this->normalizeKind($kind);
        $normalizedValue = $this->normalizeValue($value);

        $column = $normalizedKind === 'mention'
            ? 'mention_suggestions'
            : 'hashtag_suggestions';

        $current = $this->normalizeList($workspace->{$column});
        $alreadyExists = collect($current)
            ->contains(fn (string $item) => mb_strtolower($item) === mb_strtolower($normalizedValue));

        if (! $alreadyExists) {
            $current[] = $normalizedValue;
            usort($current, fn (string $a, string $b) => strcasecmp($a, $b));
            $workspace->{$column} = array_values($current);
            $workspace->save();
        }

        return $this->normalizeList($workspace->{$column});
    }

    private function normalizeKind(string $kind): string
    {
        $normalized = strtolower(trim($kind));
        if (! in_array($normalized, ['mention', 'hashtag'], true)) {
            throw ValidationException::withMessages([
                'kind' => 'Invalid suggestion kind.',
            ]);
        }

        return $normalized;
    }

    private function normalizeValue(string $value): string
    {
        $normalized = trim($value);
        if ($normalized === '') {
            throw ValidationException::withMessages([
                'value' => 'Value is required.',
            ]);
        }

        if (! preg_match('/^[\pL\pN_-]+$/u', $normalized)) {
            throw ValidationException::withMessages([
                'value' => 'Only letters, numbers, "_" and "-" are allowed.',
            ]);
        }

        return $normalized;
    }

    /**
     * @param  mixed  $value
     * @return array<int, string>
     */
    private function normalizeList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return collect($value)
            ->filter(fn ($item) => is_string($item))
            ->map(fn (string $item) => trim($item))
            ->filter(fn (string $item) => $item !== '')
            ->values()
            ->all();
    }
}
