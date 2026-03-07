<?php

namespace Database\Factories;

use App\Models\Note;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Tiptap\Editor;

/**
 * @extends Factory<Note>
 */
class NoteFactory extends Factory
{
    protected $model = Note::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $title = fake()->sentence(3);
        $body = fake()->paragraph();

        return [
            'user_id' => User::factory(),
            'parent_id' => null,
            'type' => 'note',
            'title' => $title,
            'content' => $this->makeTiptapContent($title, $body),
            'properties' => [
                'context' => fake()->word(),
            ],
        ];
    }

    public function titled(string $title): static
    {
        return $this->state(fn () => [
            'title' => $title,
            'content' => $this->makeTiptapContent($title, fake()->paragraph()),
        ]);
    }

    public function journal(): static
    {
        return $this->state(fn () => [
            'type' => 'journal',
        ]);
    }

    private function makeTiptapContent(string $title, string $body): array
    {
        $safeTitle = htmlspecialchars($title, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $safeBody = htmlspecialchars($body, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        return (new Editor)
            ->setContent("<h1>{$safeTitle}</h1><p>{$safeBody}</p>")
            ->getDocument();
    }
}

