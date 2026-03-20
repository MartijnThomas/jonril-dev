<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Workspace>
 */
class WorkspaceFactory extends Factory
{
    protected $model = Workspace::class;

    public function definition(): array
    {
        return [
            'owner_id' => User::factory(),
            'is_personal' => false,
            'name' => fake()->company().' Workspace',
            'storage_disk' => null,
            'color' => fake()->randomElement([
                'black',
                'slate',
                'zinc',
                'stone',
                'red',
                'orange',
                'amber',
                'yellow',
                'lime',
                'green',
                'emerald',
                'teal',
                'cyan',
                'sky',
                'blue',
                'indigo',
                'violet',
                'purple',
                'fuchsia',
                'pink',
                'rose',
            ]),
            'icon' => fake()->randomElement([
                'briefcase',
                'building',
                'folder',
                'file',
                'book',
                'notebook',
                'layers',
                'kanban',
                'star',
                'rocket',
                'idea',
                'tools',
            ]),
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (Workspace $workspace): void {
            if (! $workspace->users()->where('users.id', $workspace->owner_id)->exists()) {
                $workspace->users()->attach($workspace->owner_id, [
                    'role' => 'owner',
                ]);
            }
        });
    }
}
