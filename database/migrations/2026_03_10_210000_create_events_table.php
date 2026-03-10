<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('events', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('note_id')->nullable()->constrained()->nullOnDelete();
            $table->uuid('block_id')->nullable();
            $table->uuidMorphs('eventable');
            $table->text('title');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at');
            $table->string('timezone', 64)->default(config('app.timezone', 'UTC'));
            $table->date('journal_date')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['workspace_id', 'eventable_type']);
            $table->index(['note_id', 'eventable_type']);
            $table->index(['journal_date', 'eventable_type']);
            $table->index(['starts_at', 'ends_at']);
            $table->unique(
                ['note_id', 'eventable_type', 'block_id'],
                'events_note_type_block_unique',
            );
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('events');
    }
};
