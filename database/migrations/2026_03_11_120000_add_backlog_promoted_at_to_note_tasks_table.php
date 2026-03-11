<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->timestamp('backlog_promoted_at')->nullable()->after('task_status');
            $table->index(['workspace_id', 'backlog_promoted_at']);
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex(['workspace_id', 'backlog_promoted_at']);
            $table->dropColumn('backlog_promoted_at');
        });
    }
};

