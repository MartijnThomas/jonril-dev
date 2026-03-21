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
        Schema::create('timeblock_calendar_links', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignUuid('calendar_id')->constrained()->cascadeOnDelete();
            $table->uuid('note_id');
            $table->uuid('event_id');
            $table->uuid('timeblock_id')->nullable();
            $table->string('remote_uid')->nullable();
            $table->text('remote_href')->nullable();
            $table->string('remote_etag')->nullable();
            $table->string('sync_status')->default('pending_create');
            $table->timestamp('last_synced_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->unique(['event_id', 'calendar_id']);
            $table->index(['calendar_id', 'sync_status']);
            $table->index(['workspace_id', 'note_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('timeblock_calendar_links');
    }
};
