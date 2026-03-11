<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->uuid('migrated_to_note_id')->nullable()->after('backlog_promoted_at');
            $table->uuid('migrated_from_note_id')->nullable()->after('migrated_to_note_id');
            $table->index(['workspace_id', 'migrated_to_note_id']);
            $table->index(['workspace_id', 'migrated_from_note_id']);
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex(['workspace_id', 'migrated_to_note_id']);
            $table->dropIndex(['workspace_id', 'migrated_from_note_id']);
            $table->dropColumn(['migrated_to_note_id', 'migrated_from_note_id']);
        });
    }
};

