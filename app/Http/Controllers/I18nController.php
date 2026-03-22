<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Lang;

class I18nController extends Controller
{
    public function ui(Request $request): JsonResponse
    {
        $locale = $this->resolveLocale(
            $request,
            is_string($request->query('locale')) ? $request->query('locale') : null,
        );
        $version = $this->translationVersion($request, $locale);
        $requestedVersion = trim((string) $request->query('version', ''));

        if ($requestedVersion !== '' && hash_equals($version, $requestedVersion)) {
            return response()->json([
                'locale' => $locale,
                'version' => $version,
                'unchanged' => true,
            ]);
        }

        return response()->json([
            'locale' => $locale,
            'version' => $version,
            'ui' => $this->cachedUiTranslations($request, $locale),
            'unchanged' => false,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function cachedUiTranslations(Request $request, string $locale): array
    {
        if (app()->isLocal()) {
            return Lang::get('ui', [], $locale);
        }

        $cacheKey = sprintf(
            'i18n:ui:%s:%s',
            $locale,
            $this->translationVersion($request, $locale),
        );

        return Cache::remember($cacheKey, now()->addHours(12), function () use ($locale): array {
            return Lang::get('ui', [], $locale);
        });
    }

    private function translationVersion(Request $request, string $locale): string
    {
        $path = lang_path($locale.DIRECTORY_SEPARATOR.'ui.php');
        if (! is_file($path)) {
            return 'missing';
        }

        $mtime = @filemtime($path);

        return $mtime === false ? 'unknown' : (string) $mtime;
    }

    private function resolveLocale(Request $request, ?string $requestedLocale): string
    {
        $normalizedRequested = strtolower(trim((string) $requestedLocale));
        if (in_array($normalizedRequested, ['nl', 'en'], true)) {
            return $normalizedRequested;
        }

        $user = $request->user();
        if ($user instanceof User) {
            return $user->languagePreference();
        }

        $fallback = strtolower((string) config('app.locale', 'en'));

        return in_array($fallback, ['nl', 'en'], true) ? $fallback : 'en';
    }
}
