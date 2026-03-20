<?php

namespace App\Console\Commands\Workspaces;

use App\Models\Note;
use App\Models\User;
use App\Models\Workspace;
use App\Support\Notes\NoteSlugService;
use Illuminate\Console\Command;

class CreateDemoWorkspacesCommand extends Command
{
    protected $signature = 'workspaces:create-demo-notes
        {email : User email}
        {--force : Run without interactive confirmation}';

    protected $description = 'Create demo and demo-reference workspaces with kitchen-sink wiki-link notes.';

    public function handle(NoteSlugService $noteSlugService): int
    {
        $email = trim((string) $this->argument('email'));
        $force = (bool) $this->option('force');

        if ($email === '') {
            $this->error('Please provide a user email.');

            return self::FAILURE;
        }

        $user = User::query()->where('email', $email)->first();
        if (! $user) {
            $this->error("User '{$email}' not found.");

            return self::FAILURE;
        }

        if (! $force) {
            $confirmed = $this->confirm(
                "Create demo workspaces and notes for {$user->email}?",
                true,
            );

            if (! $confirmed) {
                $this->warn('Command cancelled.');

                return self::SUCCESS;
            }
        }

        $demoWorkspace = $this->ensureWorkspace($user, 'Demo Workspace');
        $demoReferenceWorkspace = $this->ensureWorkspace($user, 'Demo Reference Workspace');

        $kitchenSinkNote = $this->upsertNote($demoWorkspace, 'Kitchen Sink Note');
        $kitchenSinkReferenceNote = $this->upsertNote($demoReferenceWorkspace, 'Kitchen Sink Reference Note');
        $normalWikiLinkNote = $this->upsertNote($demoWorkspace, 'Normal Wiki-link Note');

        $this->setKitchenSinkContent($kitchenSinkNote, $kitchenSinkReferenceNote, $noteSlugService);
        $this->setKitchenSinkReferenceContent($kitchenSinkReferenceNote, $kitchenSinkNote, $noteSlugService);
        $this->setNormalWikiLinkContent($normalWikiLinkNote, $kitchenSinkNote, $noteSlugService);

        $this->table(
            ['Workspace', 'Note', 'URL'],
            [
                [$demoWorkspace->name, $kitchenSinkNote->title, $noteSlugService->urlFor($kitchenSinkNote)],
                [$demoReferenceWorkspace->name, $kitchenSinkReferenceNote->title, $noteSlugService->urlFor($kitchenSinkReferenceNote)],
                [$demoWorkspace->name, $normalWikiLinkNote->title, $noteSlugService->urlFor($normalWikiLinkNote)],
            ],
        );

        $this->info("Demo workspaces and notes are ready for {$user->email}.");

        return self::SUCCESS;
    }

    private function ensureWorkspace(User $user, string $name): Workspace
    {
        /** @var Workspace $workspace */
        $workspace = Workspace::query()->firstOrCreate(
            [
                'owner_id' => $user->id,
                'name' => $name,
            ],
            [
                'is_personal' => false,
                'editor_mode' => Workspace::EDITOR_MODE_BLOCK,
            ],
        );

        $workspace->users()->syncWithoutDetaching([
            $user->id => ['role' => 'owner'],
        ]);

        return $workspace;
    }

    private function upsertNote(Workspace $workspace, string $title): Note
    {
        /** @var Note $note */
        $note = Note::query()->firstOrNew([
            'workspace_id' => $workspace->id,
            'type' => Note::TYPE_NOTE,
            'title' => $title,
        ]);

        $note->properties = is_array($note->properties) ? $note->properties : [];
        if (! is_array($note->content)) {
            $note->content = $this->buildDocument($title);
        }
        $note->save();

        return $note->fresh();
    }

    private function setKitchenSinkContent(Note $note, Note $referenceNote, NoteSlugService $noteSlugService): void
    {
        $note->content = $this->buildDocument(
            $note->title ?: 'Kitchen Sink Note',
            [
                [
                    'prefix' => 'Reference workspace: ',
                    'label' => 'Kitchen Sink Reference Note',
                    'target' => $referenceNote,
                    'href' => $noteSlugService->urlFor($referenceNote),
                    'cross_workspace' => true,
                ],
            ],
            [
                'Yellow highlight sample' => 'var(--tt-color-highlight-yellow)',
                'Blue highlight sample' => 'var(--tt-color-highlight-blue)',
                'Red highlight sample' => 'var(--tt-color-highlight-red)',
            ],
        );
        $note->save();
        $noteSlugService->syncSingleNote($note);
    }

    private function setKitchenSinkReferenceContent(Note $note, Note $kitchenSinkNote, NoteSlugService $noteSlugService): void
    {
        $note->content = $this->buildDocument(
            $note->title ?: 'Kitchen Sink Reference Note',
            [
                [
                    'prefix' => 'Back to demo workspace: ',
                    'label' => 'Kitchen Sink Note',
                    'target' => $kitchenSinkNote,
                    'href' => $noteSlugService->urlFor($kitchenSinkNote),
                    'cross_workspace' => true,
                ],
            ],
            [
                'Green highlight sample' => 'var(--tt-color-highlight-green)',
                'Purple highlight sample' => 'var(--tt-color-highlight-purple)',
                'Orange highlight sample' => 'var(--tt-color-highlight-orange)',
                'Pink highlight sample' => 'var(--tt-color-highlight-pink)',
            ],
        );
        $note->save();
        $noteSlugService->syncSingleNote($note);
    }

    private function setNormalWikiLinkContent(Note $note, Note $kitchenSinkNote, NoteSlugService $noteSlugService): void
    {
        $note->content = $this->buildDocument(
            $note->title ?: 'Normal Wiki-link Note',
            [
                [
                    'prefix' => 'Same workspace wiki-link: ',
                    'label' => 'Kitchen Sink Note',
                    'target' => $kitchenSinkNote,
                    'href' => $noteSlugService->urlFor($kitchenSinkNote),
                    'cross_workspace' => false,
                ],
            ],
            [
                'Gray highlight sample' => 'var(--tt-color-highlight-gray)',
                'Brown highlight sample' => 'var(--tt-color-highlight-brown)',
            ],
        );
        $note->save();
        $noteSlugService->syncSingleNote($note);
    }

    /**
     * @param  array<int, array{
     *     prefix: string,
     *     label: string,
     *     target: Note,
     *     href: string,
     *     cross_workspace: bool
     * }>  $wikiLinks
     * @param  array<string, string>  $highlightSamples
     * @return array<string, mixed>
     */
    private function buildDocument(string $heading, array $wikiLinks = [], array $highlightSamples = []): array
    {
        $content = [
            [
                'type' => 'heading',
                'attrs' => ['level' => 1],
                'content' => [
                    ['type' => 'text', 'text' => $heading],
                ],
            ],
        ];

        foreach ($wikiLinks as $link) {
            $content[] = [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => $link['prefix']],
                    [
                        'type' => 'text',
                        'text' => $link['label'],
                        'marks' => [
                            [
                                'type' => 'wikiLink',
                                'attrs' => [
                                    'noteId' => $link['target']->id,
                                    'href' => $link['href'],
                                    'crossWorkspace' => $link['cross_workspace'],
                                ],
                            ],
                        ],
                    ],
                ],
            ];
        }

        foreach ($highlightSamples as $label => $color) {
            $content[] = [
                'type' => 'paragraph',
                'content' => [
                    [
                        'type' => 'text',
                        'text' => (string) $label,
                        'marks' => [
                            [
                                'type' => 'highlight',
                                'attrs' => [
                                    'color' => $color,
                                ],
                            ],
                        ],
                    ],
                ],
            ];
        }

        if (count($content) === 1) {
            $content[] = [
                'type' => 'paragraph',
                'content' => [
                    ['type' => 'text', 'text' => 'Demo note content.'],
                ],
            ];
        }

        return [
            'type' => 'doc',
            'content' => $content,
        ];
    }
}
