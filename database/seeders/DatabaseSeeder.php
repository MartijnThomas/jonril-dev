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

        $acme = Note::factory()
            ->titled('Acme')
            ->state(['user_id' => $user->id])
            ->create();

        $projectOne = Note::factory()
            ->titled('Project 1')
            ->state(['user_id' => $user->id, 'parent_id' => $acme->id])
            ->create();

        Note::factory()
            ->titled('Some note')
            ->state(['user_id' => $user->id, 'parent_id' => $projectOne->id])
            ->create();

        Note::factory()
            ->titled('Project 2')
            ->state(['user_id' => $user->id, 'parent_id' => $acme->id])
            ->create();

        Note::factory()
            ->titled('Daily Journal')
            ->journal()
            ->state(['user_id' => $user->id])
            ->create();
    }
}
