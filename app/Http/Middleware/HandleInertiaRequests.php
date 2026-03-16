<?php

namespace App\Http\Middleware;

use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use App\Models\User;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use Carbon\Carbon;
use Carbon\CarbonInterface;
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
            'workspaceLinkableNotes' => fn () => $this->workspaceLinkableNotes($request),
            'workspaceMeetingParentOptions' => fn () => $this->workspaceMeetingParentOptions($request),
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

    private function resolveUserTimezone(Request $request): string
    {
        $user = $request->user();
        if ($user instanceof User) {
            return $user->timezonePreference();
        }

        return config('app.timezone', 'UTC');
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
                    ->orWhere('type', Note::TYPE_NOTE);
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
     * @return array<int, array{id: string, name: string, slug: string, color: string, timeblock_color: string|null, icon: string, role: string, is_migrated_source: bool}>
     */
    private function workspaceSummary(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }

        return $user->workspaces()
            ->select('workspaces.id', 'workspaces.name', 'workspaces.slug', 'workspaces.color', 'workspaces.timeblock_color', 'workspaces.icon', 'workspaces.migrated_at', 'workspace_user.role')
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
                'is_migrated_source' => $workspace->migrated_at !== null,
            ])
            ->values()
            ->all();
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
     *     note_id:string|null,
     *     starts_at:string|null,
     *     ends_at:string|null,
     *     timezone:string|null,
     *     location:string|null,
     *     task_block_id:string|null,
     *     task_checked:bool|null,
     *     task_status:string|null,
     *     note_title:string|null,
     *     href:string|null,
     *     meeting_note_id:string|null,
     *     meeting_note_href:string|null
     *   }>
     * }
     */
    private function sidebarEventsPayload(Request $request): array
    {
        $workspace = $this->resolvedWorkspace($request);
        $userTimezone = $this->resolveUserTimezone($request);
        $anchorDate = $this->resolveSidebarEventsDate($request);

        if (! $workspace) {
            return [
                'date' => $anchorDate->toDateString(),
                'events' => [],
            ];
        }

        $startOfDayUtc = $anchorDate->copy()->timezone($userTimezone)->startOfDay()->timezone('UTC');
        $endOfDayUtc = $anchorDate->copy()->timezone($userTimezone)->endOfDay()->timezone('UTC');

        $activeCalendarIds = Calendar::query()
            ->where('workspace_id', $workspace->id)
            ->where('is_active', true)
            ->pluck('id');

        $rawEvents = Event::query()
            ->with(['eventable', 'note:id,title,slug,type,journal_granularity,journal_date,workspace_id,parent_id,properties'])
            ->where('workspace_id', $workspace->id)
            ->where('starts_at', '<=', $endOfDayUtc)
            ->where('ends_at', '>=', $startOfDayUtc)
            ->where(function ($q) use ($activeCalendarIds): void {
                $q->whereNot('eventable_type', CalendarItem::class)
                    ->orWhereHasMorph('eventable', CalendarItem::class, function ($q2) use ($activeCalendarIds): void {
                        $q2->whereIn('calendar_id', $activeCalendarIds);
                    });
            })
            ->orderBy('starts_at')
            ->orderBy('ends_at')
            ->get()
            ->filter(function (Event $event) use ($anchorDate): bool {
                if ($event->eventable_type !== Timeblock::class) {
                    return true;
                }

                return (string) $event->journal_date?->toDateString() === $anchorDate->toDateString();
            })
            ->map(function (Event $event) use ($userTimezone): array {
                $isTimeblock = $event->eventable_type === Timeblock::class;
                $timeblock = $isTimeblock ? $event->eventable : null;
                $calendarItem = $event->eventable_type === CalendarItem::class ? $event->eventable : null;
                $allDay = (bool) $event->all_day;

                return [
                    'id' => $event->id,
                    'block_id' => $event->block_id ?? $event->id,
                    'type' => $isTimeblock ? 'timeblock' : 'event',
                    'all_day' => $allDay,
                    'title' => (string) $event->title,
                    'note_id' => $event->note_id,
                    'starts_at' => $allDay
                        ? $event->starts_at?->toDateString()
                        : $event->starts_at?->copy()->timezone($userTimezone)->toIso8601String(),
                    'ends_at' => $allDay
                        ? $event->ends_at?->copy()->subDay()->toDateString()
                        : $event->ends_at?->copy()->timezone($userTimezone)->toIso8601String(),
                    'location' => $isTimeblock ? $timeblock->location : ($calendarItem?->location ?: null),
                    'task_block_id' => $timeblock instanceof Timeblock ? $timeblock->task_block_id : null,
                    'task_checked' => $timeblock instanceof Timeblock ? $timeblock->task_checked : null,
                    'task_status' => $timeblock instanceof Timeblock ? $timeblock->task_status : null,
                    'note_title' => $event->note?->display_title,
                    'href' => $event->note ? $this->noteSlugService->urlFor($event->note) : null,
                    'timezone' => $userTimezone,
                ];
            });

        // Resolve meeting note hrefs and IDs via block_id (timeblocks) or event id (calendar items).
        $blockIds = $rawEvents->pluck('block_id')->filter()->unique()->values()->all();
        $meetingNoteMap = []; // block_id|event_id => ['id' => ..., 'href' => ...]
        if (! empty($blockIds)) {
            Note::query()
                ->where('type', Note::TYPE_MEETING)
                ->where('workspace_id', $workspace->id)
                ->get(['id', 'meta', 'slug', 'type', 'journal_granularity', 'journal_date', 'workspace_id'])
                ->each(function (Note $n) use (&$meetingNoteMap): void {
                    $key = is_array($n->meta) ? ($n->meta['event_block_id'] ?? null) : null;
                    if ($key) {
                        $meetingNoteMap[$key] = [
                            'id' => $n->id,
                            'href' => $this->noteSlugService->urlFor($n),
                        ];
                    }
                });
        }

        $events = $rawEvents->map(function (array $e) use ($meetingNoteMap): array {
            $match = isset($e['block_id']) ? ($meetingNoteMap[$e['block_id']] ?? null) : null;

            return [
                ...$e,
                'meeting_note_id' => $match ? $match['id'] : null,
                'meeting_note_href' => $match ? $match['href'] : null,
            ];
        })->values()->all();

        return [
            'date' => $anchorDate->toDateString(),
            'events' => $events,
        ];
    }

    /**
     * @return array<int, array{id: string, title: string, path: string|null}>
     */
    private function workspaceLinkableNotes(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }

        $workspace = $this->resolvedWorkspace($request);
        if (! $workspace) {
            return [];
        }

        $meetingParentIds = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where('type', Note::TYPE_MEETING)
            ->whereNotNull('parent_id')
            ->pluck('parent_id')
            ->unique()
            ->all();

        $notes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('type', [Note::TYPE_NOTE, null])
            ->whereNotIn('id', $meetingParentIds)
            ->get(['id', 'title', 'parent_id', 'properties']);

        /** @var \Illuminate\Support\Collection<string, array{id: string, title: string, parent_id: string|null}> $byId */
        $byId = $notes->keyBy('id');

        $resolvePath = function (string $noteId) use ($byId): ?string {
            $segments = [];
            $visited = [];
            $cursor = $byId->get($noteId);

            while ($cursor !== null && ! isset($visited[$cursor['id']])) {
                $visited[$cursor['id']] = true;
                array_unshift($segments, $cursor['title'] ?? 'Untitled');

                if (! $cursor['parent_id']) {
                    break;
                }

                $cursor = $byId->get($cursor['parent_id']);
            }

            return count($segments) > 0 ? implode(' / ', $segments) : null;
        };

        return $notes
            ->map(fn (Note $note) => [
                'id' => $note->id,
                'title' => $note->display_title,
                'path' => $note->parent_id ? $resolvePath($note->parent_id) : null,
            ])
            ->sortBy(fn (array $n) => strtolower((string) $n['path'].' '.$n['title']))
            ->values()
            ->all();
    }

    /**
     * @return array<int, array{id: string, title: string, path: string|null, is_journal: bool}>
     */
    private function workspaceMeetingParentOptions(Request $request): array
    {
        $user = $request->user();
        if (! $user) {
            return [];
        }

        $workspace = $this->resolvedWorkspace($request);
        if (! $workspace) {
            return [];
        }

        $userTimezone = $this->resolveUserTimezone($request);
        $todayDate = now($userTimezone)->toDateString();

        $todayJournal = Note::query()
            ->where('workspace_id', $workspace->id)
            ->where('type', Note::TYPE_JOURNAL)
            ->where('journal_granularity', Note::JOURNAL_DAILY)
            ->whereDate('journal_date', $todayDate)
            ->first(['id', 'journal_date']);

        $notes = Note::query()
            ->where('workspace_id', $workspace->id)
            ->whereIn('type', [Note::TYPE_NOTE, null])
            ->get(['id', 'title', 'parent_id', 'properties']);

        /** @var \Illuminate\Support\Collection<string, array{id: string, title: string, parent_id: string|null}> $byId */
        $byId = $notes->keyBy('id');

        $resolvePath = function (string $noteId) use ($byId): ?string {
            $segments = [];
            $visited = [];
            $cursor = $byId->get($noteId);

            while ($cursor !== null && ! isset($visited[$cursor['id']])) {
                $visited[$cursor['id']] = true;
                array_unshift($segments, $cursor['title'] ?? 'Untitled');

                if (! $cursor['parent_id']) {
                    break;
                }

                $cursor = $byId->get($cursor['parent_id']);
            }

            return count($segments) > 0 ? implode(' / ', $segments) : null;
        };

        $options = $notes
            ->map(fn (Note $note) => [
                'id' => $note->id,
                'title' => $note->display_title,
                'path' => $note->parent_id ? $resolvePath($note->parent_id) : null,
                'is_journal' => false,
            ])
            ->sortBy(fn (array $n) => strtolower((string) $n['path'].' '.$n['title']))
            ->values()
            ->all();

        if ($todayJournal) {
            array_unshift($options, [
                'id' => $todayJournal->id,
                'title' => "Daily note · {$todayDate}",
                'path' => null,
                'is_journal' => true,
            ]);
        }

        return $options;
    }

    private function resolveSidebarEventsDate(Request $request): CarbonInterface
    {
        $userTimezone = $this->resolveUserTimezone($request);
        $granularity = $request->route('granularity');
        $period = $request->route('period');

        if (
            $granularity === Note::JOURNAL_DAILY &&
            is_string($period) &&
            preg_match('/^\d{4}-\d{2}-\d{2}$/', $period) === 1
        ) {
            try {
                return Carbon::createFromFormat('Y-m-d', $period, $userTimezone)->startOfDay();
            } catch (\Throwable) {
                // Fall back to "today" below.
            }
        }

        return now($userTimezone)->startOfDay();
    }
}
