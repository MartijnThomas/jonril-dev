<?php

namespace Database\Seeders;

use App\Models\Note;
use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $user = User::query()->first();

        if (! $user) {
            $user = User::factory()->create([
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]);
        }
        $workspace = $user->currentWorkspace();

        $acme = Note::factory()
            ->titled('Acme')
            ->state(['workspace_id' => $workspace?->id])
            ->create();

        $projectOne = Note::factory()
            ->titled('Project 1')
            ->state(['workspace_id' => $workspace?->id, 'parent_id' => $acme->id])
            ->create();

        Note::factory()
            ->titled('Some note')
            ->state(['workspace_id' => $workspace?->id, 'parent_id' => $projectOne->id])
            ->create();

        Note::factory()
            ->titled('Project 2')
            ->state(['workspace_id' => $workspace?->id, 'parent_id' => $acme->id])
            ->create();

        Note::factory()
            ->titled('Daily Journal')
            ->journal()
            ->state(['workspace_id' => $workspace?->id])
            ->create();
    }
}
