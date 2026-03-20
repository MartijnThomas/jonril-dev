<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\NoteImage>
 */
class NoteImageFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'workspace_id' => Workspace::factory(),
            'note_id' => null,
            'uploaded_by' => User::factory(),
            'disk' => (string) config('note-images.default_disk', 'public'),
            'path' => 'uploads/images/workspaces/'.$this->faker->uuid().'/'.$this->faker->uuid().'.png',
            'filename' => $this->faker->slug().'.png',
            'mime_type' => 'image/png',
            'size_bytes' => $this->faker->numberBetween(1_024, 5_242_880),
            'width' => $this->faker->numberBetween(64, 2048),
            'height' => $this->faker->numberBetween(64, 2048),
            'sha256' => hash('sha256', $this->faker->uuid()),
            'status' => 'active',
        ];
    }
}
