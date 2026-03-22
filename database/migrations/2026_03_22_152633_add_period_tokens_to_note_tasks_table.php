<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->string('due_date_token', 16)->nullable()->after('deadline_date');
            $table->string('deadline_date_token', 16)->nullable()->after('due_date_token');
            $table->index(['workspace_id', 'due_date_token']);
            $table->index(['workspace_id', 'deadline_date_token']);
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex('note_tasks_workspace_id_due_date_token_index');
            $table->dropIndex('note_tasks_workspace_id_deadline_date_token_index');
            $table->dropColumn(['due_date_token', 'deadline_date_token']);
        });
    }
};
