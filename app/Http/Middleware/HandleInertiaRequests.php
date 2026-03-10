<?php

namespace App\Http\Middleware;

use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Lang;
use Illuminate\Support\Facades\App;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    public function __construct(
        private readonly NoteSlugService $noteSlugService,
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
        $locale = $this->resolveLocale($request);
        App::setLocale($locale);
        $cachedSidebarEventsPayload = null;
        $sidebarEventsPayload = function () use (&$cachedSidebarEventsPayload, $request): array {
            if ($cachedSidebarEventsPayload === null) {
                $cachedSidebarEventsPayload = $this->sidebarEventsPayload($request);
            }

            return $cachedSidebarEventsPayload;
        };

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $request->user(),
            ],
            'workspaces' => fn () => $this->workspaceSummary($request),
            'currentWorkspace' => fn () => $this->currentWorkspaceSummary($request),
            'notesTree' => fn () => $this->buildNotesTree($request),
            'sidebarOpen' => $this->sidebarDefaultOpenState($request, 'left'),
            'rightSidebarOpen' => $this->sidebarDefaultOpenState($request, 'right'),
            'todayEvents' => fn () => $sidebarEventsPayload()['events'],
            'todayEventsDate' => fn () => $sidebarEventsPayload()['date'],
            'locale' => $locale,
            'translations' => fn () => [
                'ui' => Lang::get('ui', [], $locale),
            ],
        ];
    }

    private function resolveLocale(Request $request): string
    {
        $language = strtolower((string) data_get($request->user()?->settings, 'language', app()->getLocale()));

        return in_array($language, ['nl', 'en'], true) ? $language : 'en';
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
     *   parent_id: string|null,
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

        /** @var Collection<int, Note> $notes */
        $notes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where(function ($query) {
                $query->whereNull('type')
                    ->orWhere('type', '!=', 'journal');
            })
            ->orderBy('created_at')
            ->get(['id', 'workspace_id', 'slug', 'title', 'properties', 'parent_id', 'type']);

        $nodes = [];
        foreach ($notes as $note) {
            $nodes[$note->id] = [
                'id' => $note->id,
                'title' => $note->display_title,
                'href' => $this->noteSlugService->urlFor($note),
                'icon' => $note->icon,
                'icon_color' => $note->icon_color,
                'icon_bg' => $note->icon_bg,
                'parent_id' => $note->parent_id,
                'children' => [],
            ];
        }

        $tree = [];

        foreach ($nodes as $id => $node) {
            $parentId = $node['parent_id'];
            if ($parentId && isset($nodes[$parentId])) {
                $nodes[$parentId]['children'][] = &$nodes[$id];
            } else {
                $tree[] = &$nodes[$id];
            }
        }

        $sortTree = function (array &$items) use (&$sortTree): void {
            usort($items, function (array $a, array $b): int {
                $aHasChildren = count($a['children']) > 0;
                $bHasChildren = count($b['children']) > 0;

                if ($aHasChildren !== $bHasChildren) {
                    return $aHasChildren ? -1 : 1;
                }

                return strcasecmp((string) ($a['title'] ?? ''), (string) ($b['title'] ?? ''));
            });

            foreach ($items as &$item) {
                if (! empty($item['children'])) {
                    $sortTree($item['children']);
                }
            }
        };

        $sortTree($tree);

        $stripParent = function (array &$items) use (&$stripParent): void {
            foreach ($items as &$item) {
                unset($item['parent_id']);
                $stripParent($item['children']);
            }
        };

        $stripParent($tree);

        return $tree;
    }

    /**
     * @return array<int, array{id: string, name: string, slug: string, color: string, timeblock_color: string|null, icon: string, role: string}>
     */
    private function workspaceSummary(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }

        return $user->workspaces()
            ->select('workspaces.id', 'workspaces.name', 'workspaces.slug', 'workspaces.color', 'workspaces.timeblock_color', 'workspaces.icon', 'workspace_user.role')
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
            ])
            ->values()
            ->all();
    }

    /**
     * @return array{id: string, name: string, slug: string, color: string, timeblock_color: string|null, icon: string, role: string}|null
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

        return [
            'id' => $workspace->id,
            'name' => $workspace->name,
            'slug' => $workspace->slug,
            'color' => $workspace->color,
            'timeblock_color' => $workspace->timeblock_color,
            'icon' => $workspace->icon,
            'role' => (string) ($membership?->pivot->role ?? 'member'),
        ];
    }

    private function resolvedWorkspace(Request $request): ?Workspace
    {
        $user = $request->user();
        if (! $user) {
            return null;
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
     *   date: string,
     *   events: array<int, array{
     *     id:string,
     *     type:string,
     *     title:string,
     *     starts_at:string|null,
     *     ends_at:string|null,
     *     location:string|null,
     *     note_title:string|null,
     *     href:string|null
     *   }>
     * }
     */
    private function sidebarEventsPayload(Request $request): array
    {
        $workspace = $this->resolvedWorkspace($request);
        $anchorDate = $this->resolveSidebarEventsDate($request);

        if (! $workspace) {
            return [
                'date' => $anchorDate->toDateString(),
                'events' => [],
            ];
        }

        $startOfDay = $anchorDate->copy()->timezone(config('app.timezone'))->startOfDay();
        $endOfDay = (clone $startOfDay)->endOfDay();

        $events = Event::query()
            ->with(['eventable', 'note:id,title,slug,type,journal_granularity,journal_date,workspace_id,parent_id,properties'])
            ->where('workspace_id', $workspace->id)
            ->where('starts_at', '<=', $endOfDay)
            ->where('ends_at', '>=', $startOfDay)
            ->orderBy('starts_at')
            ->orderBy('ends_at')
            ->get()
            ->map(function (Event $event): array {
                $isTimeblock = $event->eventable_type === Timeblock::class;
                $timeblock = $isTimeblock ? $event->eventable : null;

                return [
                    'id' => $event->id,
                    'type' => $isTimeblock ? 'timeblock' : 'event',
                    'title' => (string) $event->title,
                    'starts_at' => $event->starts_at?->toIso8601String(),
                    'ends_at' => $event->ends_at?->toIso8601String(),
                    'location' => $timeblock instanceof Timeblock ? $timeblock->location : null,
                    'note_title' => $event->note?->display_title,
                    'href' => $event->note ? $this->noteSlugService->urlFor($event->note) : null,
                ];
            })
            ->values()
            ->all();

        return [
            'date' => $anchorDate->toDateString(),
            'events' => $events,
        ];
    }

    private function resolveSidebarEventsDate(Request $request): CarbonInterface
    {
        $granularity = $request->route('granularity');
        $period = $request->route('period');

        if (
            $granularity === Note::JOURNAL_DAILY &&
            is_string($period) &&
            preg_match('/^\d{4}-\d{2}-\d{2}$/', $period) === 1
        ) {
            try {
                return Carbon::createFromFormat('Y-m-d', $period, config('app.timezone'))->startOfDay();
            } catch (\Throwable) {
                // Fall back to "today" below.
            }
        }

        return now(config('app.timezone'))->startOfDay();
    }
}
