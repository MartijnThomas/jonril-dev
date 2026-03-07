<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->uuid('workspace_id')->nullable()->after('id');
        });

        DB::statement('update note_tasks set workspace_id = (select notes.workspace_id from notes where notes.id = note_tasks.note_id)');

        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex(['user_id', 'note_id']);
            $table->dropIndex(['user_id', 'checked']);
            $table->dropIndex(['user_id', 'due_date']);
            $table->dropIndex(['user_id', 'deadline_date']);
            $table->dropIndex(['user_id', 'parent_note_id']);

            $table->foreign('workspace_id')->references('id')->on('workspaces')->cascadeOnDelete();
            $table->index(['workspace_id', 'note_id']);
            $table->index(['workspace_id', 'checked']);
            $table->index(['workspace_id', 'due_date']);
            $table->index(['workspace_id', 'deadline_date']);
            $table->index(['workspace_id', 'parent_note_id']);

            $table->dropColumn('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->unsignedBigInteger('user_id')->nullable()->after('id');
            $table->index(['user_id', 'note_id']);
            $table->index(['user_id', 'checked']);
            $table->index(['user_id', 'due_date']);
            $table->index(['user_id', 'deadline_date']);
            $table->index(['user_id', 'parent_note_id']);
        });

        DB::statement('update note_tasks set user_id = (select workspaces.owner_id from workspaces where workspaces.id = note_tasks.workspace_id)');

        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropForeign(['workspace_id']);
            $table->dropIndex(['workspace_id', 'note_id']);
            $table->dropIndex(['workspace_id', 'checked']);
            $table->dropIndex(['workspace_id', 'due_date']);
            $table->dropIndex(['workspace_id', 'deadline_date']);
            $table->dropIndex(['workspace_id', 'parent_note_id']);
            $table->dropColumn('workspace_id');
        });
    }
};
