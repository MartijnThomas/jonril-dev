<?php

use App\Jobs\ReindexNoteJob;
use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;

it('shows weekly and monthly token scheduled tasks in the related panel on journal note pages', function () {
    $user = User::factory()->create([
        'password' => bcrypt('password'),
    ]);

    /** @var Workspace $workspace */
    $workspace = $user->currentWorkspace();
    $workspace->forceFill([
        'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
    ])->save();

    $daily = Note::factory()->for($workspace)->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_DAILY,
        'journal_date' => '2026-03-22',
        'title' => 'Zondag 22 maart 2026',
        'slug' => 'journal/daily/2026-03-22',
        'content' => [
            'type' => 'doc',
            'content' => [
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => 'week-13-task',
                        'blockStyle' => 'task',
                        'checked' => false,
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => 'This will be for week 13 >2026-W13'],
                    ],
                ],
                [
                    'type' => 'paragraph',
                    'attrs' => [
                        'id' => 'april-task',
                        'blockStyle' => 'task',
                        'checked' => false,
                    ],
                    'content' => [
                        ['type' => 'text', 'text' => 'This will be for April >>2026-04'],
                    ],
                ],
            ],
        ],
    ]);

    Note::factory()->for($workspace)->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_WEEKLY,
        'journal_date' => '2026-03-23',
        'title' => 'Week 13 2026',
        'slug' => 'journal/weekly/2026-W13',
    ]);

    Note::factory()->for($workspace)->create([
        'type' => Note::TYPE_JOURNAL,
        'journal_granularity' => Note::JOURNAL_MONTHLY,
        'journal_date' => '2026-04-01',
        'title' => 'April 2026',
        'slug' => 'journal/monthly/2026-04',
    ]);

    ReindexNoteJob::dispatchSync($daily->id, $user->id);

    $page = visit('/login')
        ->fill('email', $user->email)
        ->fill('password', 'password')
        ->script('document.querySelector(\'button[type="submit"]\')?.click();');

    $page = visit('/journal/2026-W13');

    $page->assertPathIs('/journal/2026-W13')
        ->waitForText('This will be for week 13')
        ->assertSee('This will be for week 13')
        ->assertNoJavaScriptErrors();

    $page->navigate('/journal/2026-04')
        ->assertPathIs('/journal/2026-04')
        ->waitForText('This will be for April')
        ->assertSee('This will be for April')
        ->assertNoJavaScriptErrors();
});
