<?php

namespace App\Http\Controllers\Settings;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Inertia\Inertia;

class TaskFilterPresetController extends Controller
{
    public function edit(Request $request)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        return Inertia::render('settings/task-filters', [
            'filterPresets' => $this->taskFilterPresetsForUser($user),
        ]);
    }

    public function update(Request $request, string $presetId)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:80'],
            'favorite' => ['nullable', 'boolean'],
        ]);

        $settings = is_array($user->settings) ? $user->settings : [];
        $presets = collect(data_get($settings, 'tasks.filter_presets', []))
            ->filter(fn ($preset) => is_array($preset))
            ->values();

        $targetIndex = $presets->search(
            fn (array $preset): bool => (string) ($preset['id'] ?? '') === $presetId,
        );
        if ($targetIndex === false) {
            return back();
        }

        $favorite = (bool) ($validated['favorite'] ?? false);
        $name = trim((string) $validated['name']);

        $presets->put((int) $targetIndex, [
            ...$presets[(int) $targetIndex],
            'id' => $presetId,
            'name' => $name,
            'favorite' => $favorite,
            'updated_at' => now()->toIso8601String(),
        ]);

        data_set($settings, 'tasks.filter_presets', $presets->all());
        $user->forceFill(['settings' => $settings])->save();

        return back();
    }

    public function destroy(Request $request, string $presetId)
    {
        $user = $request->user();
        if (! $user) {
            abort(403);
        }

        $settings = is_array($user->settings) ? $user->settings : [];
        $presets = collect(data_get($settings, 'tasks.filter_presets', []))
            ->filter(fn ($preset) => is_array($preset))
            ->reject(fn (array $preset): bool => (string) ($preset['id'] ?? '') === $presetId)
            ->values()
            ->all();

        data_set($settings, 'tasks.filter_presets', $presets);
        $user->forceFill(['settings' => $settings])->save();

        return back();
    }

    /**
     * @return array<int, array{id:string,name:string,favorite:bool,filters:array<string,mixed>,updated_at:?string}>
     */
    private function taskFilterPresetsForUser($user): array
    {
        $settings = is_array($user?->settings) ? $user->settings : [];

        return collect(data_get($settings, 'tasks.filter_presets', []))
            ->filter(fn ($preset) => is_array($preset))
            ->map(function (array $preset): array {
                return [
                    'id' => is_string($preset['id'] ?? null) ? (string) $preset['id'] : '',
                    'name' => is_string($preset['name'] ?? null) ? trim((string) $preset['name']) : '',
                    'favorite' => (bool) ($preset['favorite'] ?? false),
                    'filters' => is_array($preset['filters'] ?? null) ? $preset['filters'] : [],
                    'updated_at' => is_string($preset['updated_at'] ?? null) ? (string) $preset['updated_at'] : null,
                ];
            })
            ->filter(fn (array $preset) => $preset['id'] !== '' && $preset['name'] !== '')
            ->sortByDesc(fn (array $preset) => $preset['favorite'] ? 1 : 0)
            ->values()
            ->all();
    }
}
