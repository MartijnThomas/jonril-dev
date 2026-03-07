<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('note_headings', function (Blueprint $table): void {
            $table->id();
            $table->uuid('workspace_id');
            $table->uuid('note_id');
            $table->string('block_id');
            $table->unsignedTinyInteger('level')->nullable();
            $table->string('text');
            $table->timestamps();

            $table->foreign('workspace_id')->references('id')->on('workspaces')->cascadeOnDelete();
            $table->foreign('note_id')->references('id')->on('notes')->cascadeOnDelete();

            $table->index(['workspace_id', 'note_id']);
            $table->index(['workspace_id', 'block_id']);
            $table->index(['workspace_id', 'text']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('note_headings');
    }
};
