<?php

namespace App\Http\Middleware;

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use App\Support\Workspaces\PersonalWorkspaceResolver;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Lang;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    public function __construct(
        private readonly NoteSlugService $noteSlugService,
        private readonly PersonalWorkspaceResolver $personalWorkspaceResolver,
    ) {}

    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $this->hydrateUserTimezonePreferenceFromCookie($request);
        $locale = $this->resolveLocale($request);
        App::setLocale($locale);

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'workspaces' => fn () => $this->workspaceSummary($request),
            'currentWorkspace' => fn () => $this->currentWorkspaceSummary($request),
            'personalWorkspace' => fn () => $this->personalWorkspaceSummary($request),
            'notesTree' => fn () => $this->buildNotesTree($request),
            'sidebarOpen' => $this->sidebarDefaultOpenState($request, 'left'),
            'rightSidebarOpen' => $this->sidebarDefaultOpenState($request, 'right'),
            'locale' => $locale,
            'translations' => fn () => [
                'ui' => $this->cachedUiTranslations($request, $locale),
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function cachedUiTranslations(Request $request, string $locale): array
    {
        // Keep locale translation edits hot-reload friendly while developing.
        if (app()->isLocal()) {
            return Lang::get('ui', [], $locale);
        }

        $cacheKey = sprintf(
            'i18n:ui:%s:%s',
            $locale,
            $this->translationCacheSignature($request, $locale),
        );

        return Cache::remember($cacheKey, now()->addHours(12), function () use ($locale): array {
            return Lang::get('ui', [], $locale);
        });
    }

    private function translationCacheSignature(Request $request, string $locale): string
    {
        $assetVersion = (string) ($this->version($request) ?? '');
        if ($assetVersion !== '') {
            return md5($assetVersion);
        }

        $path = lang_path($locale.DIRECTORY_SEPARATOR.'ui.php');
        if (! is_file($path)) {
            return 'missing';
        }

        $mtime = @filemtime($path);

        return $mtime === false ? 'unknown' : (string) $mtime;
    }

    private function resolveLocale(Request $request): string
    {
        $language = strtolower((string) data_get($request->user()?->settings, 'language', app()->getLocale()));

        return in_array($language, ['nl', 'en'], true) ? $language : 'en';
    }

    private function hydrateUserTimezonePreferenceFromCookie(Request $request): void
    {
        $user = $request->user();
        if (! $user instanceof User) {
            return;
        }

        $storedTimezone = trim((string) data_get($user->settings, 'timezone', ''));
        if ($storedTimezone !== '') {
            return;
        }

        $cookieTimezone = trim((string) $request->cookie('user_tz', ''));
        if (
            $cookieTimezone === ''
            || ! in_array($cookieTimezone, timezone_identifiers_list(), true)
        ) {
            return;
        }

        $settings = is_array($user->settings) ? $user->settings : [];
        $settings['timezone'] = $cookieTimezone;

        $user->forceFill([
            'settings' => $settings,
        ])->saveQuietly();
    }

    private function sidebarDefaultOpenState(Request $request, string $side): bool
    {
        $cookieName = $side === 'right' ? 'right_sidebar_state' : 'sidebar_state';
        $cookieValue = $request->cookie($cookieName);

        if ($cookieValue !== null) {
            return $cookieValue === 'true';
        }

        $userSettings = is_array($request->user()?->settings) ? $request->user()?->settings : [];

        return (bool) data_get(
            $userSettings,
            $side === 'right' ? 'editor.sidebar_right_open_default' : 'editor.sidebar_left_open_default',
            true,
        );
    }

    /**
     * @return array<int, array{
     *   id: string,
     *   title: string,
     *   href: string,
     *   icon: string|null,
     *   icon_color: string|null,
     *   icon_bg: string|null,
     *   has_children: bool,
     *   children: array
     * }>
     */
    private function buildNotesTree(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }
        $workspace = $this->resolvedWorkspace($request);
        if (! $workspace) {
            return [];
        }

        return Cache::remember(
            "notes_tree_{$workspace->id}",
            now()->addDay(),
            function () use ($workspace): array {
                /** @var Collection<int, Note> $roots */
                $roots = Note::query()
                    ->where('workspace_id', $workspace->id)
                    ->where(function ($query) {
                        $query->whereNull('type')
                            ->orWhere('type', Note::TYPE_NOTE);
                    })
                    ->whereNull('parent_id')
                    ->withExists([
                        'children as has_children' => function ($query): void {
                            $query->where(function ($inner): void {
                                $inner->whereNull('type')
                                    ->orWhere('type', Note::TYPE_NOTE);
                            });
                        },
                    ])
                    ->get(['id', 'workspace_id', 'slug', 'title', 'properties', 'type']);

                return $roots
                    ->map(function (Note $note): array {
                        return [
                            'id' => $note->id,
                            'title' => $note->display_title,
                            'href' => $this->noteSlugService->urlFor($note),
                            'icon' => $note->icon,
                            'icon_color' => $note->icon_color,
                            'icon_bg' => $note->icon_bg,
                            'has_children' => (bool) ($note->has_children ?? false),
                            'children' => [],
                        ];
                    })
                    ->sort(function (array $a, array $b): int {
                        if ($a['has_children'] !== $b['has_children']) {
                            return $a['has_children'] ? -1 : 1;
                        }

                        return strcasecmp((string) ($a['title'] ?? ''), (string) ($b['title'] ?? ''));
                    })
                    ->values()
                    ->all();
            },
        );
    }

    /**
     * @return array{
     *   id: string,
     *   name: string,
     *   slug: string,
     *   color: string,
     *   timeblock_color: string|null,
     *   icon: string,
     *   role: string,
     *   is_migrated_source: bool,
     *   note_counts: array{total: int, normal: int, journal: int}
     * }|null
     */
    private function currentWorkspaceSummary(Request $request): ?array
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $workspace = $this->resolvedWorkspace($request);
        if (! $workspace) {
            return null;
        }

        $membership = $user->workspaces()
            ->where('workspaces.id', $workspace->id)
            ->select('workspace_user.role')
            ->first();
        $noteCounts = $this->workspaceNoteCounts($workspace);

        return [
            'id' => $workspace->id,
            'name' => $workspace->name,
            'slug' => $workspace->slug,
            'color' => $workspace->color,
            'timeblock_color' => $workspace->timeblock_color,
            'icon' => $workspace->icon,
            'role' => (string) ($membership?->pivot->role ?? 'member'),
            'is_migrated_source' => $workspace->isMigratedSource(),
            'note_counts' => $noteCounts,
        ];
    }

    /**
     * @return array{total: int, normal: int, journal: int}
     */
    private function workspaceNoteCounts(Workspace $workspace): array
    {
        return Cache::remember(
            "notes_count_{$workspace->id}",
            now()->addDay(),
            function () use ($workspace): array {
                $totals = Note::query()
                    ->where('workspace_id', $workspace->id)
                    ->selectRaw(
                        'count(*) as total, sum(case when type = ? then 1 else 0 end) as journal',
                        [Note::TYPE_JOURNAL],
                    )
                    ->first();

                $total = (int) ($totals?->total ?? 0);
                $journal = (int) ($totals?->journal ?? 0);

                return [
                    'total' => $total,
                    'normal' => max(0, $total - $journal),
                    'journal' => $journal,
                ];
            },
        );
    }

    private function resolvedWorkspace(Request $request): ?Workspace
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        if ($request->routeIs('journal.*')) {
            return $user->currentWorkspace();
        }

        $routeWorkspace = $request->route('workspace');
        if ($routeWorkspace instanceof Workspace) {
            $isMember = $user->workspaces()
                ->where('workspaces.id', $routeWorkspace->id)
                ->exists();

            return $isMember ? $routeWorkspace : null;
        }
        if (is_string($routeWorkspace) && trim($routeWorkspace) !== '') {
            return $user->workspaces()
                ->where('workspaces.slug', trim($routeWorkspace))
                ->first();
        }

        return $user->currentWorkspace();
    }

    /**
     * @return array{
     *   id: string,
     *   name: string,
     *   slug: string,
     *   color: string,
     *   timeblock_color: string|null,
     *   icon: string,
     *   role: string,
     *   is_migrated_source: bool
     * }|null
     */
    private function personalWorkspaceSummary(Request $request): ?array
    {
        $user = $request->user();
        if (! $user) {
            return null;
        }

        $workspace = $this->personalWorkspaceResolver->resolveFor($user);
        if (! $workspace) {
            return null;
        }

        $membership = $user->workspaces()
            ->where('workspaces.id', $workspace->id)
            ->select('workspace_user.role')
            ->first();

        return [
            'id' => $workspace->id,
            'name' => $workspace->name,
            'slug' => $workspace->slug,
            'color' => $workspace->color,
            'timeblock_color' => $workspace->timeblock_color,
            'icon' => $workspace->icon,
            'role' => (string) ($membership?->pivot->role ?? 'member'),
            'is_migrated_source' => $workspace->isMigratedSource(),
        ];
    }

    /**
     * @return array<int, array{id: string, name: string, slug: string, color: string, timeblock_color: string|null, icon: string, role: string, is_personal: bool, is_migrated_source: bool}>
     */
    private function workspaceSummary(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }

        return $user->workspaces()
            ->select('workspaces.id', 'workspaces.name', 'workspaces.slug', 'workspaces.color', 'workspaces.timeblock_color', 'workspaces.icon', 'workspaces.is_personal', 'workspaces.migrated_at', 'workspace_user.role')
            ->orderByRaw("case when workspace_user.role = 'owner' then 0 else 1 end")
            ->orderBy('workspaces.name')
            ->get()
            ->map(fn ($workspace) => [
                'id' => $workspace->id,
                'name' => $workspace->name,
                'slug' => $workspace->slug,
                'color' => $workspace->color,
                'timeblock_color' => $workspace->timeblock_color,
                'icon' => $workspace->icon,
                'role' => (string) ($workspace->pivot->role ?? 'member'),
                'is_personal' => (bool) $workspace->is_personal,
                'is_migrated_source' => $workspace->migrated_at !== null,
            ])
            ->values()
            ->all();
    }
}
