<?php

namespace App\Services;

use App\Models\Calendar;
use App\Models\CalendarItem;
use App\Models\CalendarSyncedRange;
use App\Models\Event;
use App\Models\Note;
use App\Models\Timeblock;
use App\Models\TimeblockCalendarLink;
use Carbon\Carbon;
use Illuminate\Support\Str;
use Sabre\DAV\Client;
use Sabre\DAV\Xml\Property\ResourceType;
use Sabre\VObject\Reader;

class CalDavService
{
    private const CALDAV_NS = 'urn:ietf:params:xml:ns:caldav';

    private const ICAL_NS = 'http://apple.com/ns/ical/';

    /**
     * Test whether credentials can reach the CalDAV server.
     */
    public function testConnection(string $url, string $username, string $password): bool
    {
        try {
            $client = $this->makeClient($url, $username, $password);
            $response = $client->propFind('', ['{DAV:}resourcetype'], 0);

            return is_array($response);
        } catch (\Throwable) {
            return false;
        }
    }

    /**
     * Discover all calendars at the given server URL for the given credentials.
     *
     * Follows the CalDAV discovery chain:
     *   server root → current-user-principal → calendar-home-set → calendars
     *
     * @return array<int, array{name: string, url: string, color: string|null}>
     */
    public function discoverCalendars(string $serverUrl, string $username, string $password): array
    {
        $client = $this->makeClient($serverUrl, $username, $password);

        $principalUrl = $this->findCurrentUserPrincipal($client);
        if ($principalUrl === null) {
            return [];
        }

        $homeSetUrl = $this->findCalendarHomeSet($client, $principalUrl);
        if ($homeSetUrl === null) {
            return [];
        }

        return $this->listCalendarsAtUrl($client, $homeSetUrl);
    }

    /**
     * Sync events for the given calendar covering -7 days to +30 days.
     * Also marks the overlapping YYYY-MM periods as synced.
     */
    public function sync(Calendar $calendar): void
    {
        $credentials = $this->credentialsForCalendar($calendar);
        $client = $this->makeClient($calendar->url, $credentials['username'], $credentials['password']);

        $rangeStart = now()->subDays(7)->startOfDay();
        $rangeEnd = now()->addDays(30)->endOfDay();

        $items = $this->fetchRemoteItems($client, $calendar->url, $rangeStart, $rangeEnd);

        // Null means the remote request failed — skip to avoid false deletions.
        if ($items === null) {
            return;
        }

        foreach ($items as $item) {
            $this->upsertCalendarItem($calendar, $item);
        }

        $this->pruneStaleItems($calendar, $items, $rangeStart, $rangeEnd);

        // Mark every YYYY-MM period covered by this window as synced.
        $cursor = $rangeStart->copy()->startOfMonth();
        while ($cursor->lte($rangeEnd)) {
            CalendarSyncedRange::query()->updateOrCreate(
                ['calendar_id' => $calendar->id, 'period' => $cursor->format('Y-m')],
                ['synced_at' => now()],
            );
            $cursor = $cursor->addMonth();
        }

        $calendar->update([
            'last_synced_at' => now(),
        ]);
    }

    /**
     * Sync events for the given calendar for a specific YYYY-MM period (on-demand).
     */
    public function syncPeriod(Calendar $calendar, string $period): void
    {
        $credentials = $this->credentialsForCalendar($calendar);
        $client = $this->makeClient($calendar->url, $credentials['username'], $credentials['password']);

        $month = Carbon::createFromFormat('Y-m', $period);
        $rangeStart = $month->copy()->startOfMonth()->startOfDay();
        $rangeEnd = $month->copy()->endOfMonth()->endOfDay();

        $items = $this->fetchRemoteItems($client, $calendar->url, $rangeStart, $rangeEnd);

        if ($items === null) {
            return;
        }

        foreach ($items as $item) {
            $this->upsertCalendarItem($calendar, $item);
        }

        $this->pruneStaleItems($calendar, $items, $rangeStart, $rangeEnd);

        CalendarSyncedRange::query()->updateOrCreate(
            ['calendar_id' => $calendar->id, 'period' => $period],
            ['synced_at' => now()],
        );
    }

    /**
     * @return array{uid: string, href: string, etag: string|null}
     */
    public function createTimeblockEvent(
        Calendar $calendar,
        Event $event,
        Timeblock $timeblock,
        string $uid,
    ): array {
        $credentials = $this->credentialsForCalendar($calendar);
        $client = $this->makeClient($calendar->url, $credentials['username'], $credentials['password']);
        $href = $this->buildTimeblockHref($calendar->url, $uid);
        $ical = $this->buildTimeblockIcal($uid, $event, $timeblock);

        $response = $client->request('PUT', $href, $ical, [
            'Content-Type' => 'text/calendar; charset=utf-8',
        ]);

        $status = (int) ($response['statusCode'] ?? 0);
        if (! in_array($status, [200, 201, 204], true)) {
            throw new \RuntimeException("CalDAV create failed with status {$status}");
        }

        return [
            'uid' => $uid,
            'href' => $href,
            'etag' => $this->extractResponseEtag($response),
        ];
    }

    /**
     * @return array{uid: string, href: string, etag: string|null}
     */
    public function updateTimeblockEvent(
        Calendar $calendar,
        TimeblockCalendarLink $link,
        Event $event,
        Timeblock $timeblock,
    ): array {
        $credentials = $this->credentialsForCalendar($calendar);
        $client = $this->makeClient($calendar->url, $credentials['username'], $credentials['password']);
        $uid = is_string($link->remote_uid) && trim($link->remote_uid) !== ''
            ? trim($link->remote_uid)
            : "jonril-timeblock-{$event->id}";
        $href = is_string($link->remote_href) && trim($link->remote_href) !== ''
            ? trim($link->remote_href)
            : $this->buildTimeblockHref($calendar->url, $uid);
        $ical = $this->buildTimeblockIcal($uid, $event, $timeblock);

        $headers = [
            'Content-Type' => 'text/calendar; charset=utf-8',
        ];
        if (is_string($link->remote_etag) && trim($link->remote_etag) !== '') {
            $headers['If-Match'] = trim($link->remote_etag);
        }

        $response = $client->request('PUT', $href, $ical, $headers);

        $status = (int) ($response['statusCode'] ?? 0);
        if ($status === 412 && isset($headers['If-Match'])) {
            // Stale ETag: retry once without If-Match so we can re-establish remote_etag.
            unset($headers['If-Match']);
            $response = $client->request('PUT', $href, $ical, $headers);
            $status = (int) ($response['statusCode'] ?? 0);
        }

        if (! in_array($status, [200, 201, 204], true)) {
            throw new \RuntimeException("CalDAV update failed with status {$status}");
        }

        return [
            'uid' => $uid,
            'href' => $href,
            'etag' => $this->extractResponseEtag($response),
        ];
    }

    public function deleteTimeblockEvent(Calendar $calendar, TimeblockCalendarLink $link): void
    {
        $href = is_string($link->remote_href) && trim($link->remote_href) !== ''
            ? trim($link->remote_href)
            : null;
        if (! $href) {
            return;
        }

        $credentials = $this->credentialsForCalendar($calendar);
        $client = $this->makeClient($calendar->url, $credentials['username'], $credentials['password']);
        $headers = [];
        if (is_string($link->remote_etag) && trim($link->remote_etag) !== '') {
            $headers['If-Match'] = trim($link->remote_etag);
        }

        $response = $client->request('DELETE', $href, null, $headers);
        $status = (int) ($response['statusCode'] ?? 0);
        if (! in_array($status, [200, 202, 204, 404], true)) {
            throw new \RuntimeException("CalDAV delete failed with status {$status}");
        }
    }

    // -------------------------------------------------------------------------
    // Discovery internals
    // -------------------------------------------------------------------------

    private function findCurrentUserPrincipal(Client $client): ?string
    {
        try {
            $props = $client->propFind('', ['{DAV:}current-user-principal'], 0);
        } catch (\Throwable) {
            return null;
        }

        return $this->extractHref($props['{DAV:}current-user-principal'] ?? null);
    }

    private function findCalendarHomeSet(Client $client, string $principalUrl): ?string
    {
        try {
            $props = $client->propFind($principalUrl, [
                '{'.self::CALDAV_NS.'}calendar-home-set',
            ], 0);
        } catch (\Throwable) {
            return null;
        }

        return $this->extractHref($props['{'.self::CALDAV_NS.'}calendar-home-set'] ?? null);
    }

    /**
     * Extract a string href from whatever sabre/dav returns for an href property.
     * Handles: Href objects, plain strings, flat arrays, and sabre's generic
     * parsed-element arrays [['name' => '...', 'value' => '...', 'attributes' => []]].
     */
    private function extractHref(mixed $value): ?string
    {
        if ($value instanceof \Sabre\DAV\Xml\Property\Href) {
            $href = $value->getHref();

            return $href !== '' ? $href : null;
        }

        if (is_string($value) && $value !== '') {
            return $value;
        }

        if (! is_array($value)) {
            return null;
        }

        // Flat keyed array: ['href' => '/path/'] or ['{DAV:}href' => '/path/']
        foreach (['{DAV:}href', 'href'] as $key) {
            if (isset($value[$key]) && is_string($value[$key]) && $value[$key] !== '') {
                return $value[$key];
            }
        }

        // Sabre generic parsed elements: [['name' => '{DAV:}href', 'value' => '/path/', ...]]
        foreach ($value as $element) {
            if (is_string($element) && $element !== '') {
                return $element;
            }

            if (is_array($element) && isset($element['value']) && is_string($element['value']) && $element['value'] !== '') {
                return $element['value'];
            }
        }

        return null;
    }

    /**
     * @return array<int, array{name: string, url: string, color: string|null}>
     */
    private function listCalendarsAtUrl(Client $client, string $homeSetUrl): array
    {
        try {
            $response = $client->propFind($homeSetUrl, [
                '{DAV:}resourcetype',
                '{DAV:}displayname',
                '{'.self::ICAL_NS.'}calendar-color',
            ], 1);
        } catch (\Throwable) {
            return [];
        }

        $calendars = [];

        foreach ($response as $href => $props) {
            $resourceType = $props['{DAV:}resourcetype'] ?? null;

            $isCalendar = $resourceType instanceof ResourceType
                && in_array('{'.self::CALDAV_NS.'}calendar', $resourceType->getValue(), true);

            if (! $isCalendar) {
                continue;
            }

            $color = $props['{'.self::ICAL_NS.'}calendar-color'] ?? null;

            $calendars[] = [
                'name' => (string) ($props['{DAV:}displayname'] ?? Str::afterLast(rtrim($href, '/'), '/')),
                'url' => $client->getAbsoluteUrl($href),
                'color' => is_string($color) && trim($color) !== '' ? $color : null,
            ];
        }

        return $calendars;
    }

    // -------------------------------------------------------------------------
    // Pruning
    // -------------------------------------------------------------------------

    /**
     * Compare what the remote returned against what we have stored for this calendar
     * in the given date range. For any CalendarItem whose event start falls in the
     * range but was not returned by the remote:
     *
     *   - If a meeting note is linked → mark the Event as remote-deleted (keeps the
     *     note visible with a "deleted event" indicator in the sidebar).
     *   - If no meeting note is linked → hard-delete the CalendarItem and Event to
     *     keep the database clean.
     *
     * If the event later reappears on the remote, upsertCalendarItem() clears
     * remote_deleted_at automatically.
     *
     * @param  array<int, array{uid: string, href: string, etag: string, ical: string, vevent: mixed}>  $returnedItems
     */
    private function pruneStaleItems(
        Calendar $calendar,
        array $returnedItems,
        \Carbon\CarbonInterface $rangeStart,
        \Carbon\CarbonInterface $rangeEnd,
    ): void {
        $returnedUids = collect($returnedItems)->pluck('uid')->flip()->all();

        // Find CalendarItems for this calendar whose event started inside the synced
        // range but whose UID was NOT returned by the remote.
        $staleItems = CalendarItem::query()
            ->where('calendar_id', $calendar->id)
            ->whereNotIn('uid', array_keys($returnedUids))
            ->whereHas('event', function ($q) use ($rangeStart, $rangeEnd): void {
                $q->where('starts_at', '>=', $rangeStart)
                    ->where('starts_at', '<=', $rangeEnd);
            })
            ->with('event')
            ->get();

        if ($staleItems->isEmpty()) {
            return;
        }

        // Collect all event IDs/block IDs so we can batch-check for meeting notes.
        $eventIds = $staleItems->map(fn (CalendarItem $i) => $i->event?->id)->filter()->values()->all();
        $blockIds = $staleItems->map(fn (CalendarItem $i) => $i->event?->block_id)->filter()->values()->all();
        $allLookupIds = array_values(array_unique(array_merge($eventIds, $blockIds)));

        // One query: which of these events have a meeting note linked via meta?
        $notedEventIds = Note::query()
            ->where('type', Note::TYPE_MEETING)
            ->whereNull('deleted_at')
            ->whereIn('meta->event_block_id', $allLookupIds)
            ->get(['meta'])
            ->map(fn (Note $n) => is_array($n->meta) ? ($n->meta['event_block_id'] ?? null) : null)
            ->filter()
            ->flip()
            ->all();

        foreach ($staleItems as $item) {
            $event = $item->event;

            if (! $event) {
                $item->delete();

                continue;
            }

            $hasNote = isset($notedEventIds[$event->id]) || isset($notedEventIds[$event->block_id]);

            if ($hasNote) {
                // Preserve the event so the meeting note can still display it,
                // but flag it as deleted from the remote calendar.
                $event->update(['remote_deleted_at' => now()]);
            } else {
                // No note — clean up both records entirely.
                $event->delete();
                $item->delete();
            }
        }
    }

    // -------------------------------------------------------------------------
    // Sync internals
    // -------------------------------------------------------------------------

    /**
     * Returns null when the remote request fails (network error, unexpected status),
     * so callers can skip pruning and avoid false deletions.
     *
     * @return array<int, array{uid: string, href: string, etag: string, ical: string, vevent: mixed}>|null
     */
    private function fetchRemoteItems(Client $client, string $calendarUrl, \Carbon\CarbonInterface $rangeStart, \Carbon\CarbonInterface $rangeEnd): ?array
    {
        $start = $rangeStart->utc()->format('Ymd\THis\Z');
        $end = $rangeEnd->utc()->format('Ymd\THis\Z');

        $body = <<<XML
            <?xml version="1.0" encoding="UTF-8"?>
            <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
                <d:prop>
                    <d:getetag/>
                    <c:calendar-data/>
                </d:prop>
                <c:filter>
                    <c:comp-filter name="VCALENDAR">
                        <c:comp-filter name="VEVENT">
                            <c:time-range start="{$start}" end="{$end}"/>
                        </c:comp-filter>
                    </c:comp-filter>
                </c:filter>
            </c:calendar-query>
            XML;

        try {
            $response = $client->request('REPORT', $calendarUrl, $body, [
                'Depth' => '1',
                'Content-Type' => 'application/xml; charset=utf-8',
            ]);
        } catch (\Throwable) {
            return null;
        }

        if (($response['statusCode'] ?? 0) !== 207) {
            return null;
        }

        return $this->parseMultiStatusResponse($response['body'] ?? '');
    }

    /**
     * @return array<int, array{uid: string, href: string, etag: string, ical: string, vevent: mixed}>
     */
    private function parseMultiStatusResponse(string $body): array
    {
        if (empty($body)) {
            return [];
        }

        try {
            $xml = new \SimpleXMLElement($body);
        } catch (\Throwable) {
            return [];
        }

        $xml->registerXPathNamespace('d', 'DAV:');
        $xml->registerXPathNamespace('c', 'urn:ietf:params:xml:ns:caldav');

        $items = [];

        foreach ($xml->xpath('//d:response') as $response) {
            $response->registerXPathNamespace('d', 'DAV:');
            $response->registerXPathNamespace('c', 'urn:ietf:params:xml:ns:caldav');

            $href = (string) ($response->xpath('d:href')[0] ?? '');
            $etag = (string) ($response->xpath('.//d:getetag')[0] ?? '');
            $ical = (string) ($response->xpath('.//c:calendar-data')[0] ?? '');

            if (empty($ical)) {
                continue;
            }

            try {
                $vcalendar = Reader::read($ical);
            } catch (\Throwable) {
                continue;
            }

            foreach ($vcalendar->VEVENT ?? [] as $vevent) {
                $uid = (string) ($vevent->UID ?? Str::uuid());

                $items[] = [
                    'uid' => $uid,
                    'href' => $href,
                    'etag' => trim($etag, '"'),
                    'ical' => $ical,
                    'vevent' => $vevent,
                ];
            }
        }

        return $items;
    }

    /**
     * @param  array{uid: string, href: string, etag: string, ical: string, vevent: mixed}  $item
     */
    private function upsertCalendarItem(Calendar $calendar, array $item): void
    {
        $vevent = $item['vevent'];

        $dtstart = $vevent->DTSTART ?? null;
        $dtend = $vevent->DTEND ?? null;
        $allDay = $dtstart && $dtstart->getValueType() === 'DATE';

        $startsAt = null;
        if ($dtstart) {
            try {
                $startsAt = Carbon::instance($dtstart->getDateTime())->utc();
            } catch (\Throwable) {
                $startsAt = null;
            }
        }

        $endsAt = null;
        if ($dtend) {
            try {
                $endsAt = Carbon::instance($dtend->getDateTime())->utc();
            } catch (\Throwable) {
                $endsAt = null;
            }
        } elseif ($startsAt && $allDay) {
            $endsAt = (clone $startsAt)->addDay();
        }

        $calendarItem = CalendarItem::query()->updateOrCreate(
            ['calendar_id' => $calendar->id, 'uid' => $item['uid']],
            [
                'etag' => $item['etag'],
                'href' => $item['href'],
                'location' => (string) ($vevent->LOCATION ?? ''),
                'description' => (string) ($vevent->DESCRIPTION ?? ''),
                'rrule' => isset($vevent->RRULE) ? (string) $vevent->RRULE : null,
                'raw_ical' => $item['ical'],
            ],
        );

        Event::query()->updateOrCreate(
            [
                'eventable_type' => CalendarItem::class,
                'eventable_id' => $calendarItem->id,
            ],
            [
                'workspace_id' => $calendar->workspace_id,
                'title' => (string) ($vevent->SUMMARY ?? '(No title)'),
                'starts_at' => $startsAt,
                'ends_at' => $endsAt,
                'all_day' => $allDay,
                'timezone' => config('app.timezone'),
                // Clear any prior remote-deletion flag — the event is back.
                'remote_deleted_at' => null,
            ],
        );
    }

    protected function makeClient(string $url, string $username, string $password): Client
    {
        return new Client([
            'baseUri' => $url,
            'userName' => $username,
            'password' => $password,
        ]);
    }

    /**
     * @return array{username: string, password: string}
     */
    private function credentialsForCalendar(Calendar $calendar): array
    {
        $connection = $calendar->connection()->first();
        if (! $connection) {
            throw new \RuntimeException("Calendar {$calendar->id} has no connection.");
        }

        return [
            'username' => (string) $connection->username,
            'password' => (string) $connection->password,
        ];
    }

    private function buildTimeblockHref(string $calendarUrl, string $uid): string
    {
        $base = rtrim($calendarUrl, '/');
        $safeUid = rawurlencode($uid);

        return "{$base}/{$safeUid}.ics";
    }

    private function extractResponseEtag(array $response): ?string
    {
        $headers = $response['headers'] ?? [];
        if (! is_array($headers)) {
            return null;
        }

        $etag = $headers['etag'] ?? $headers['ETag'] ?? null;
        if (is_array($etag)) {
            $etag = $etag[0] ?? null;
        }

        if (! is_string($etag) || trim($etag) === '') {
            return null;
        }

        return trim($etag, "\" \t\n\r\0\x0B");
    }

    private function buildTimeblockIcal(string $uid, Event $event, Timeblock $timeblock): string
    {
        $startUtc = $event->starts_at?->copy()->utc();
        $endUtc = $event->ends_at?->copy()->utc();
        if (! $startUtc || ! $endUtc) {
            throw new \RuntimeException('Timeblock event is missing start or end time.');
        }

        $now = now()->utc()->format('Ymd\THis\Z');
        $dtStart = $startUtc->format('Ymd\THis\Z');
        $dtEnd = $endUtc->format('Ymd\THis\Z');
        $summary = $this->escapeIcalText((string) $event->title);
        $location = $this->escapeIcalText((string) ($timeblock->location ?? ''));
        $description = $this->escapeIcalText('Created by Jonril timeblock sync');

        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Jonril//Timeblock Sync//EN',
            'CALSCALE:GREGORIAN',
            'BEGIN:VEVENT',
            "UID:{$uid}",
            "DTSTAMP:{$now}",
            "DTSTART:{$dtStart}",
            "DTEND:{$dtEnd}",
            "SUMMARY:{$summary}",
            "DESCRIPTION:{$description}",
            'X-JONRIL-SOURCE:TIMEBLOCK',
            "X-JONRIL-EVENT-ID:{$event->id}",
        ];

        if ($location !== '') {
            $lines[] = "LOCATION:{$location}";
        }

        $lines[] = 'END:VEVENT';
        $lines[] = 'END:VCALENDAR';

        return implode("\r\n", $lines)."\r\n";
    }

    private function escapeIcalText(string $value): string
    {
        return str_replace(
            ['\\', ';', ',', "\r\n", "\n", "\r"],
            ['\\\\', '\;', '\,', '\n', '\n', '\n'],
            $value,
        );
    }
}
