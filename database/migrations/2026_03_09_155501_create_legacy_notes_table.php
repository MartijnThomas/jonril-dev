<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('legacy_notes', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('workspace_id');
            $table->uuid('note_id')->nullable();
            $table->unsignedBigInteger('legacy_note_id');
            $table->unsignedBigInteger('legacy_team_id')->nullable();
            $table->string('legacy_slug');
            $table->string('legacy_hash')->nullable();
            $table->json('legacy_note_payload');
            $table->text('legacy_frontmatter_raw')->nullable();
            $table->json('legacy_frontmatter')->nullable();
            $table->json('legacy_blocks')->nullable();
            $table->timestamp('imported_at')->nullable();
            $table->timestamps();

            $table->foreign('workspace_id')
                ->references('id')
                ->on('workspaces')
                ->cascadeOnDelete();
            $table->foreign('note_id')
                ->references('id')
                ->on('notes')
                ->nullOnDelete();

            $table->unique(
                ['workspace_id', 'legacy_team_id', 'legacy_note_id'],
                'legacy_notes_workspace_team_note_unique',
            );
            $table->index(['workspace_id', 'legacy_slug']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legacy_notes');
    }
};
