<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->string('priority', 16)->nullable()->after('checked');
            $table->index(['workspace_id', 'priority']);
        });
    }

    public function down(): void
    {
        Schema::table('note_tasks', function (Blueprint $table): void {
            $table->dropIndex(['workspace_id', 'priority']);
            $table->dropColumn('priority');
        });
    }
};
