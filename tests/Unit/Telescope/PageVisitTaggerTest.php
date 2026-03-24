<?php

use App\Support\Telescope\PageVisitTagger;
use Laravel\Telescope\EntryType;
use Laravel\Telescope\IncomingEntry;

function makeRequestEntry(string $method, string $uri, array $headers = []): IncomingEntry
{
    return IncomingEntry::make([
        'method' => $method,
        'uri' => $uri,
        'headers' => $headers,
        'response_status' => 200,
    ])->type(EntryType::REQUEST);
}

test('it tags note show, journal show, settings, tasks and kanban page visits', function (): void {
    $note = makeRequestEntry('GET', '/notes/019cf580-9d17-73b6-9eb0-26c883f09e74');
    $journal = makeRequestEntry('GET', '/journal/2026-03-18');
    $journalScoped = makeRequestEntry('GET', '/w/bullet-journal-2/journal/2026-03-18');
    $settings = makeRequestEntry('GET', '/settings/profile');
    $tasks = makeRequestEntry('GET', '/tasks');
    $kanban = makeRequestEntry('GET', '/tasks/kanban');

    expect(PageVisitTagger::tagsFor($note))->toContain('page-visit', 'page:note-show');
    expect(PageVisitTagger::tagsFor($journal))->toContain('page-visit', 'page:journal-show');
    expect(PageVisitTagger::tagsFor($journalScoped))->toContain('page-visit', 'page:journal-show');
    expect(PageVisitTagger::tagsFor($settings))->toContain('page-visit', 'page:settings');
    expect(PageVisitTagger::shouldRecordInProduction($settings))->toBeTrue();
    expect(PageVisitTagger::tagsFor($tasks))->toContain('page-visit', 'page:tasks');
    expect(PageVisitTagger::shouldRecordInProduction($tasks))->toBeTrue();
    expect(PageVisitTagger::tagsFor($kanban))->toContain('page-visit', 'page:kanban');
    expect(PageVisitTagger::shouldRecordInProduction($kanban))->toBeTrue();
});

test('it does not tag async backend requests', function (): void {
    $indicators = makeRequestEntry('GET', '/w/bullet-journal-2/events/indicators?start=2026-03-01&end=2026-03-31');
    $settingsData = makeRequestEntry('GET', '/settings/workspaces/019cf580-9b7e-73a4-9187-d8caad193067/data');
    $maintenanceTrigger = makeRequestEntry('POST', '/settings/admin/operations/maintenance');

    expect(PageVisitTagger::tagsFor($indicators))->toBe([]);
    expect(PageVisitTagger::tagsFor($settingsData))->toBe([]);
    expect(PageVisitTagger::tagsFor($maintenanceTrigger))->toBe([]);
    expect(PageVisitTagger::shouldRecordInProduction($indicators))->toBeFalse();
});

test('it does not tag inertia partial requests as page visits', function (): void {
    $partialJournal = makeRequestEntry('GET', '/journal/2026-03-16', [
        'x-inertia' => ['true'],
        'x-inertia-partial-component' => ['notes/show'],
        'x-inertia-partial-data' => ['relatedTasks,backlinks'],
        'x-requested-with' => ['XMLHttpRequest'],
    ]);

    expect(PageVisitTagger::tagsFor($partialJournal))->toBe([]);
    expect(PageVisitTagger::shouldRecordInProduction($partialJournal))->toBeFalse();
});
