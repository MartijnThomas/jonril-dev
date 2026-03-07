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
            'name' => fake()->company().' Workspace',
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
