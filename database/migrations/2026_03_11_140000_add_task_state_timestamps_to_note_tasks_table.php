<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->timestamp('canceled_at')->nullable()->after('task_status');
            $table->timestamp('completed_at')->nullable()->after('canceled_at');
            $table->index(['workspace_id', 'completed_at']);
            $table->index(['workspace_id', 'canceled_at']);
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex(['workspace_id', 'completed_at']);
            $table->dropIndex(['workspace_id', 'canceled_at']);
            $table->dropColumn(['completed_at', 'canceled_at']);
        });
    }
};
