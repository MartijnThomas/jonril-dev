<?php

test('meilisearch note indexes configure typo tolerance for command search', function (): void {
    $settings = config('scout.meilisearch.index-settings');

    expect(data_get($settings, 'notes.typoTolerance.enabled'))->toBeTrue()
        ->and(data_get($settings, 'notes.typoTolerance.minWordSizeForTypos.oneTypo'))->toBe(3)
        ->and(data_get($settings, 'notes.typoTolerance.minWordSizeForTypos.twoTypos'))->toBe(7)
        ->and(data_get($settings, 'note_tasks.typoTolerance.enabled'))->toBeTrue()
        ->and(data_get($settings, 'note_tasks.typoTolerance.minWordSizeForTypos.oneTypo'))->toBe(3)
        ->and(data_get($settings, 'note_tasks.typoTolerance.minWordSizeForTypos.twoTypos'))->toBe(7);
});
