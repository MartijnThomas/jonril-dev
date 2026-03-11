<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->timestamp('started_at')->nullable()->after('completed_at');
            $table->index(['workspace_id', 'started_at']);
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex('note_tasks_workspace_id_started_at_index');
            $table->dropColumn('started_at');
        });
    }
};

